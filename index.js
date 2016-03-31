'use strict';

//default mongo config object
var memberObject        =   {
                                "_id":0,
                                "host" : "",
                                "arbiterOnly" : false,
                                "buildIndexes" : true,
                                "hidden" : false,
                                "priority" : 1,
                                "tags" : {},
                                "votes" : 1
                            };


var replObj             =   {
                                "_id" : "rs0",
                                "version" : 1,
                                "members" : [],
                                "settings" : {
                                    "chainingAllowed" : true,
                                    "heartbeatIntervalMillis" : 2000,
                                    "heartbeatTimeoutSecs" : 10,
                                    "electionTimeoutMillis" : 10000,
                                    "getLastErrorModes" : {},
                                    "getLastErrorDefaults" : {
                                        "w" : 1,
                                        "wtimeout" : 0
                                    }
                                }
                            };

var privateIP           =   "";
var primaryIp           =   "";
var privateIPString     =   "";
var mongoIps            =   [];
var newReplSetMembers   =   [];
var newid               =   0;
//used for logging
var verbose             =   0;


var env = "";

var unirest = require("unirest");
var AWS = require('aws-sdk');
var Q = require('q');
var MongoClient = require('mongodb').MongoClient;
var ec2 = new AWS.EC2({"region":"eu-west-1"});

var url = "";

var cl = function(msg) {
    if ( verbose === 1) {
        console.log(msg);
    }
};

//sends your config to the primary instance and adds this instance
var sendToPrimary = function() {
    cl('sendToPrimary');

    var deferred = Q.defer();


    replObj.members = newReplSetMembers;

    console.log(replObj);

    url = 'http://' + primaryIp + ':3000';
    unirest.post(url + '/config')
    .header('Content-Type', 'application/json')
    .send(replObj)
    .end(function(resp) {
        if (resp.body.Result === 'Success') {
            setRunningTag().then(function(err) {
                if (err){cl(err);}
                deferred.resolve();
            });
        } else {
            deferred.reject("There was a problem updating the config");
        }
    });

    return deferred.promise;
};

//takes the current config and manipulate it with the results of the status
var askPrimaryToShareConfig = function() {
    cl('askPrimaryToShareConfig');

    var deferred = Q.defer();
    url = 'http://' + primaryIp + ':3000';

    unirest.get(url + '/config')
    .header('Accept', 'application/json')
    .end(function(resp) {
        if (resp && resp.body.Result === "Success") {
            replObj.version = parseInt(resp.body.Msg.config.version) + 1;
            for (var loop = 0 ; loop < resp.body.Msg.config.members.length ; loop++) {
                if (mongoIps.indexOf(resp.body.Msg.config.members[loop].host) >= 0) {
                    var config = resp.body.Msg.config.members[loop];
                    newReplSetMembers.push(config);
                }
            }

            //loop through new array to make sure the same ip isn't in there to avoid two of the
            var appeared = 0;
            for (var loop2 = 0 ; loop2 < newReplSetMembers.length ; loop2++) {
                if (newReplSetMembers[loop2].host.indexOf(privateIP) >= 0) {
                    appeared++;
                }
            }

            if (appeared === 0) {
                memberObject.host = privateIP + ':27017';
                memberObject._id = newid + 1;
                newReplSetMembers.push(memberObject);
            }

            sendToPrimary().then(function(err) {
                if (err){cl(err);}
                deferred.resolve();
            });


        } else {
            deferred.reject("There was a problem in askPrimaryToShareConfig");
        }
    });
    return deferred.promise;
};

//asks for the status from what we think is the primary.
//we basically just pick up the first result from the tag array and query it,
//if it isn't a primary instance we grab the one that is and replace the old IP
//we also monitor the healthy instances here and do not collect the ip of the instance which has failed
var askPrimaryToShareReplStatus = function() {
    cl('askPrimaryToShareReplStatus');

    var deferred = Q.defer();

    url = 'http://' + primaryIp + ':3000';

    unirest.get(url + "/config/status")
    .end(function(resp) {
        if (resp && resp.body && resp.body.Result === "Success") {
            for (var loop = 0 ; loop < resp.body.Msg.members.length ; loop++) {
                var obj = resp.body.Msg.members[loop];
                if (obj.health === 1) {
                    //the next id for a new instance
                    if (parseInt(resp.body.Msg.members[loop]._id) > newid ) {
                        newid = resp.body.Msg.members[loop]._id;
                    }

                    //
                    mongoIps.push(resp.body.Msg.members[loop].name);
                    if (obj.stateStr === "PRIMARY") {
                        var ipWithPort = resp.body.Msg.members[loop].name;
                        primaryIp = ipWithPort.replace(':27017', '');
                    }
                }
            }

            askPrimaryToShareConfig().then(function(err) {
                if (err){cl(err);}
                deferred.resolve();
            });
        } else {
            //there is a new primary, we need to what the new primary is by looping through and asking them.
            //
            deferred.reject("Status is bad");
        }
    });
    return deferred.promise;
};

//add a tag to AWS so we know that the instance has finsihed prepping, also helps new instances know where it should grab it's configs from
var setRunningTag = function() {
    cl('setPrimaryTag');

    var deferred = Q.defer();
    var instanceid = "";

    unirest.get('http://169.254.169.254/latest/meta-data/instance-id/')
    .end(function(resp) {
        cl('instance-id', resp.body);
        instanceid = resp.body;
        ec2.createTags({"Resources":[instanceid],"Tags":[{"Key":"Mongo", "Value":"Running"}]}, function(err) {
            if (err) {
                deferred.reject('failed to create tag');
            } else {
                deferred.resolve();
            }

        });
    });

    return deferred.promise;

};

//when no running tags are found, the first replica config is set to the first instance which comes alive
var initaliseReplication = function() {
    cl('initaliseReplication');
    var deferred = Q.defer();

    memberObject.host = primaryIp + ':27017';
    memberObject._id = 1;
    newReplSetMembers.push(memberObject);
    replObj.members = newReplSetMembers;

    cl(replObj);

    MongoClient.connect("mongodb://127.0.0.1:27017", function(err, db) {
        if (err) {
            cl('could not connect to Mongo');
            deferred.reject('could not connect to Mongo');
        } else {
            var adminDb = db.admin();
            adminDb.command({'replSetInitiate':replObj}, function(err) {
                if (err) {
                    cl('could not initiate');
                    cl(err);
                    deferred.reject('could not initiate');
                } else {
                    deferred.resolve();
                }
            });
        }
    });


    return deferred.promise;
};

//finds all instances which have a mongo running tag
//running means primary
var findAWSRunningTag = function() {
    cl('findAWSRunningTag');

    var deferred = Q.defer();

    var hasMongoBeenInit = {"Filters": [{"Name":"tag:Mongo", "Values":["Running"]},{"Name":"instance-state-name", "Values":["running"]},{"Name":"BBCEnviroment", "Values":[env]}]};

    ec2.describeInstances(hasMongoBeenInit, function(err, res) {

        if (err) {
            //cannot connect to AWS
            cl('cannot connect to AWS');
            deferred.reject('could not connect to AWS');

        } else if (res.Reservations.length > 0) {
            //There is a primary tag set
            //we need to ask it to add this node
            primaryIp = res.Reservations[0].Instances[0].PrivateIpAddress;
            askPrimaryToShareReplStatus();

        } else {
            //There is not primary tag set
            primaryIp = privateIP;
            setRunningTag().then(function(err) {
                if (err){cl(err);}
                initaliseReplication().then(function(err) {
                    if (err){cl(err);}
                    deferred.resolve();
                });
            });
        }
    });

    return deferred.promise;
};


var isntanceid;

//get the local ip of this instance by querying it's own meta data
var getlocalPrivateIP = function() {
    cl('getlocalPrivateIP');
    var deferred = Q.defer();

    unirest.get('http://169.254.169.254/latest/dynamic/instance-identity/document')
    .end(function(resp) {
        var j = JSON.parse(resp.body);
        privateIP = j.privateIp;
        privateIPString = j.privateIp;
        isntanceid = j.instanceId;

        ec2.describeTags({"DryRun":false, "Filters":[{"Name":"resource-id","Values":[isntanceid]}]}, function(err, res) {
            if (err) {
                cl(err);
                deferred.reject('could not connect to AWS');

            } else {
                for(var obj = 0; obj < res.Tags.length ; obj++) {
                    if (res.Tags[obj].Key === "BBCEnvironment") {
                        env = res.Tags[obj].Value;
                    }
                }

                findAWSRunningTag().then(function(err) {
                    if (err){cl(err);}
                    deferred.resolve();
                });
            }
        });
    });
    return deferred.promise;
};

getlocalPrivateIP().then(function() {
    console.log('completed');
    process.exit(0);
});
