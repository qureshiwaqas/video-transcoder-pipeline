import {SQSClient, ReceiveMessageCommand, DeleteMessageCommand} from '@aws-sdk/client-sqs'
import {ECSClient, RunTaskCommand} from '@aws-sdk/client-ecs'
import type{S3Event} from 'aws-lambda'

const client = new SQSClient({
    region: "ca-central-1",
    credentials: {
        accessKeyId: "",
        secretAccessKey: ""
    },
});

const escClient = new ECSClient({
    region: "ca-central-1",
    credentials: {
        accessKeyId: "",
        secretAccessKey: ""
    },
});

async function init() {
    const command = new ReceiveMessageCommand({
        QueueUrl: "https://sqs.ca-central-1.amazonaws.com/344999084722/temp-videos-queue-wqureshi",
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20,
        
    });

    while (true) {
        const {Messages} = await client.send(command)
        if (!Messages) {
            console.log(`No message in Queue`);
            continue;
        }

        try{
            for (const message of Messages) {
                const {MessageId, Body} = message
                console.log(`Message Received`, {MessageId, Body});
                
                // validate the event
                if (!Body) continue;
                const event = JSON.parse(Body) as S3Event;

                //ignoring the test event
                if ("Service" in event && "Event" in event) {
                    if (event.Event === "s3:TestEvent") {
                        await client.send(new DeleteMessageCommand({
                            QueueUrl: "https://sqs.ca-central-1.amazonaws.com/344999084722/temp-videos-queue-wqureshi",
                            ReceiptHandle: message.ReceiptHandle,
                        }));
                        continue;
                    };
                }                

                for (const record of event.Records) {
                    const {s3} = record
                    const {bucket, object: {key}} = s3;

                    // spin docker
                    const runTaskCommand = new RunTaskCommand({
                        taskDefinition: "arn:aws:ecs:ca-central-1:344999084722:task-definition/video-transcoder",
                        cluster: "arn:aws:ecs:ca-central-1:344999084722:cluster/dev",
                        launchType: "FARGATE",
                        networkConfiguration: {
                            awsvpcConfiguration: {
                                assignPublicIp: "ENABLED",
                                securityGroups: ["sg-013b85a6d518acb6b"],
                                subnets: [
                                    "subnet-07adac69550f3f8a3",
                                    "subnet-00138dd1c452fb09f",
                                    "subnet-0dc5bedaa184c7afb"
                                ],
                            },
                        },
                        overrides: {
                            containerOverrides: [{ name: "video-transcoder", 
                                environment: [
                                {name:"BUCKET_NAME", value: bucket.name},
                                {name:"KEY", value: key}
                            ],},],
                        },
                    });
                await escClient.send(runTaskCommand);
                // delete message from queue not to run in a loop
                await client.send(new DeleteMessageCommand({
                    QueueUrl: "https://sqs.ca-central-1.amazonaws.com/344999084722/temp-videos-queue-wqureshi",
                    ReceiptHandle: message.ReceiptHandle,
                }));
                }
            }
        }

        catch(err) {
            console.log(err)
        }
    }
}

init();
