'use strict';

var express = require('express');
var bodyParser = require('body-parser');
var MongoClient = require('mongodb').MongoClient;

var app = express();
app.use(bodyParser.json({'limit': '10mb'}));
app.use(bodyParser.urlencoded({'limit': '10mb', extended: true}));

app.get('/config', function(req, res) {
    MongoClient.connect("mongodb://127.0.0.1:27017", function(err, db) {
        if (err) {
            res.json({"Result":"Error: Cannot Connect", "Msg":err});
        } else {
            var adminDb = db.admin();
            adminDb.command({'replSetGetConfig':1}, function(err, repl) {
                if (err) {
                    res.json({"Result":"Error: No ReplSet found", "Msg":err});
                } else {
                    res.json({"Result":"Success", "Msg":repl});
                }
            });
        }
    });
});

app.get('/config/status', function(req, res) {
    MongoClient.connect("mongodb://127.0.0.1:27017", function(err, db) {
        if (err) {
            res.json({"Result":"Error: Cannot Connect", "Msg":err});
        } else {
            var adminDb = db.admin();
            adminDb.command({'replSetGetStatus':1}, function(err, repl) {
                if (err) {
                    res.json({"Result":"Error: No ReplSet found", "Msg":err});
                } else {
                    res.json({"Result":"Success", "Msg":repl});
                }
            });
        }
    });
});

app.post('/config', function(req, res) {
    MongoClient.connect("mongodb://127.0.0.1:27017", function(err, db) {
        if (err) {
            res.json({"Result":"Error: Cannot Connect", "Msg":err});
        } else {
            var adminDb = db.admin();
            adminDb.command({'replSetReconfig':req.body}, function(err, repl) {
                console.log(err, repl);
                if (err) {
                    res.json({"Result":"Error: Couldnt update", "Msg":err});
                } else {
                    res.json({"Result":"Success", "Msg": repl});
                }
            });
        }
    });
});


var server = app.listen(3000, function() {
   console.log('server is running');
});
