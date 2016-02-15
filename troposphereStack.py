from troposphere import Ref, Template, Base64
import troposphere.iam as iam
import troposphere.ec2 as ec2
import troposphere.autoscaling as autoscaling

t = Template();
t.add_version("2010-09-09");

#Policies

policyAbacusMongo = iam.Policy("policyAbacusMongo",
    PolicyDocument={"Version": "2012-10-17","Statement": [{"Action": ["s3:*"],"Effect": "Allow","Resource": "[arn of s3 here]"},{"Action": ["ec2:*"],"Effect": "Allow","Resource": "*"}]},
    PolicyName="AbacusMongoPolicy");


#Roles


roleAbacusMongo = t.add_resource(iam.Role(
    "roleAbacusMongo",
    AssumeRolePolicyDocument={"Version":"2012-10-17","Statement":[{"Effect":"Allow", "Principal":{"Service":["ec2.amazonaws.com"]}, "Action":["sts:AssumeRole"]}]},
    Policies=[policyAbacusMongo],
    Path="/abacus/mongo/role/"));


#Profiles


profileAbacusMongo = t.add_resource(iam.InstanceProfile(
    "profileAbacusMongo",
    Path="/abacus/worker/profile/",
    Roles=[Ref(roleAbacusMongo)]));


#EBS

BlockDevice = ec2.EBSBlockDevice(
  DeleteOnTermination=True,
  VolumeSize=16
);

BlockDeviceMappingsMongo = ec2.BlockDeviceMapping(
   DeviceName="/dev/xvda",
   Ebs=BlockDevice
);

#Ec2

launchConfigAbacusMongo = t.add_resource(autoscaling.LaunchConfiguration(
    "launchConfigAbacusMongo",
    AssociatePublicIpAddress=False,
    IamInstanceProfile=Ref(profileAbacusMongo),
    ImageId="ami-69b9941e",
    InstanceType="t2.small",
    KeyName="damn-es2",
    BlockDeviceMappings=[BlockDeviceMappingsMongo],
    SecurityGroups=["sg-29c6d34c", "sg-421d4126"],
    UserData=Base64({"Fn::Join":["", [
        "#!/bin/bash -xe \n",
        #install updates and dev tools
        "yum -y update \n",
        "yum -y groupinstall 'Development Tools' \n",
        #install nodejs
        "curl --silent --location https://rpm.nodesource.com/setup_5.x | bash - \n",
        "yum -y install nodejs \n",
        # #install mongo
        'echo -e "[mongodb-org-3.0] \nname=MongoDB Repository \nbaseurl=https://repo.mongodb.org/yum/amazon/2013.03/mongodb-org/3.0/x86_64/ \ngpgcheck=0 \nenabled=1" > /etc/yum.repos.d/mongodb-org-3.0.repo \n',
        "yum install -y mongodb-org \n",
        # #start mongo
        "mkdir -m 777 -p /data/db \n",
        # #download mongo starter script
        "cd /home/ec2-user/ \n",
        "git clone https://github.com/calbatron/mongo-replication-aws.git \n",
        "cd /home/ec2-user/mongo-replication-aws/ \n",
        "npm install \n",
        "npm install forever -g \n",
        "forever start listen.js \n",
        "> /etc/mongod.conf \n",
        "echo -e 'net: \n  bindIp: 0.0.0.0\n  port: 27017\nprocessManagement:  \n  fork: true\n  pidFilePath: /var/run/mongodb/mongod.pid\nreplication: \n  replSetName: rs0\nstorage: \n  dbPath: /var/lib/mongo\n  journal: \n    enabled: true\nsystemLog: \n  destination: file\n  logAppend: true\n  path: /var/log/mongodb/mongod.log' >> /etc/mongod.conf  \n",
        "service mongod start \n",
        "node index.js"
    ]]})
    ));


autoScaleAbacusMongoPrimary = t.add_resource(autoscaling.AutoScalingGroup(
    "autoScaleAbacusMongoPrimary",
    AvailabilityZones=["eu-west-1a", "eu-west-1b", "eu-west-1c"],
    DesiredCapacity="3",
    LaunchConfigurationName=Ref(launchConfigAbacusMongo),
    MaxSize="3",
    MinSize="3",
    Tags=[{"Key":"Name","Value":"abacus-mongo-replica","PropagateAtLaunch":True}, {"Key":"Lang","Value":"Mongo","PropagateAtLaunch":True}, {"Key":"Role","Value":"NoSQL Database","PropagateAtLaunch":True}, {"Key":"Abacus","Value":"Mongo Replica","PropagateAtLaunch":True}],
    VPCZoneIdentifier=["[subnet 1]", "[subnet 2]", "[subnet 3]"]
));


print(t.to_json());
