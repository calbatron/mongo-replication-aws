# Mongo Replication AWS

Automated Mongo replication setup and failover to use with AWS EC2, Cloudformation and autoscale.

just a simple cloud formation script in troposphere and node script.

The idea behind this stack is: 3 EC2 instances with 16GB EBS will start, they will bind together in a replica set. If one should die, the instance will be killed and auto scale will boot a new one. It will have a different private IP adress, but it will auto bind to the replica set. If the Primary db dies, a secondary will automatically be nominated and a new instance will auto bind to this.

This is here as just a test, you probably shouldn't use it... but it might be a good starting point for your project if you need to create a replica.
