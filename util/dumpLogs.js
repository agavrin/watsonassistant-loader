// This script will dump logs from IBM Watson Assistant instance

const API_KEY='mRwBp3gY0jTWNjCVVe1dPF4oOMXEnz5RDmOPHkFSlz'
const WS_ID='d3532349-b4d2-470c-84dd-c532107f942c'
const URL='https://api.eu-de.assistant.watson.cloud.ibm.com/assistant/api'
const FILTER='response_timestamp>2020-03-29T05:00:00.000Z'
const PAGELIMIT=500
const LOGFILE='./log.csv'

// ---------------------------

const AssistantV1 = require('ibm-watson/assistant/v1');
var dumper = require('dumper').dumper;
var logs=[]

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms));}

// Service initialization
const service = new AssistantV1({
  version: '2020-02-05',
  iam_apikey: API_KEY,
  url: URL
});

// log request parameters
const params = {
  workspace_id: WS_ID,
  filter: FILTER, // You can use various filtering here
  page_limit: PAGELIMIT // 500 is the maximum which can be retrieved
};

// Run log retrieval process
process();

async function process() {
  var curCursor=""
  var count=1
  do {
    console.log("Will try to load page "+count)
    curCursor=await retrieveLogs(curCursor)
    await sleep(100);
    if (curCursor==undefined) break;
    count++
  } while (curCursor!="")

  console.log("Retrieved: "+logs.length+" lines.")

  const createCsvWriter = require('csv-writer').createObjectCsvWriter;
  const csvWriter = createCsvWriter({
      path: LOGFILE,
      header: [
        {id: 'text', title: 'Question'},
        {id: 'intent', title: 'Intent found'},
        {id: 'confidence', title: 'Confidence'},
        {id: 'answer', title: 'Answer'},
        {id: 'request_timestamp', title: 'Request timestamp'},
        {id: 'response_timestamp', title: 'Response timestamp'},
        {id: 'conversation_id', title: 'conversation_id'},
        {id: 'session_id', title: 'session_id'},
        {id: 'assistant_id', title: 'assistant_id'}
    ]
  });

  csvWriter.writeRecords(logs)       // returns a promise
    .then(() => {
        console.log('Export completed');
    });
}

async function retrieveLogs(myCursor) {
  var myParams = params
  if (myCursor!="") myParams['cursor']=myCursor
  var next_cursor=""
  console.log("Requesting logs...")
  await service.listLogs(myParams)
    .then(res => {
      console.log("Retrieved log set of "+res['logs'].length+" lines.")
      var pagination=res["pagination"]

      if (pagination!=undefined) {
        next_cursor=pagination['next_cursor']
        console.log("Next page is available..")
      }

      for (key in res['logs']) {
        myLogObject = res['logs'][key]
        //dumper(myLogObject);
        myIntents=myLogObject["response"]["intents"]
        myIntent=""
        myIntentConfidence=0
        if (myIntents.length>0) {
          myIntent = myLogObject["response"]["intents"][0]['intent']
          myIntentConfidence = myLogObject["response"]["intents"][0]['confidence']
        }

        var myNewLogObject = {
          text: myLogObject["response"]["input"]['text'],
          intent: myIntent,
          confidence: myIntentConfidence,
          answer: myLogObject["response"]["output"]['generic'][0]['text'],
          request_timestamp: myLogObject["request_timestamp"],
          response_timestamp: myLogObject["response_timestamp"],
          conversation_id: myLogObject["response"]["context"]['conversation_id'],
          session_id: myLogObject["response"]["context"]['system']['session_id'],
          assistant_id: myLogObject["response"]["context"]['system']['assistant_id']

        }
        logs.push(myNewLogObject)
      }
    })
    .catch(err => {
      console.log(err)
    });
    return next_cursor;
}
