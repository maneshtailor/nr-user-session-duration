/**
 * Feel free to explore, or check out the full documentation
 * https://docs.newrelic.com/docs/synthetics/new-relic-synthetics/scripting-monitors/writing-api-tests
 * for details.
 */
// npm install request
//var request = require('request');
//var http = require('http');
var assert = require('assert');

//ENETER THE FOLLOWING INFORMATION
var APP_NAME="ENTER YOUR APP NAME HERE";
var ACCOUNT_ID = 'ENTER YOUR ACCOUNT ID HERE';
var QUERY_LICENCE_KEY = 'ENTER YOUR INSIGHTS QUERY KEY';
var INSERT_LICENCE_KEY = 'ENTER YOUR INSIGHTS INSERT KEY';

// YOU SHOULDN"T HAVE TO CHANGE THIS
var SINCE_CLAUSE = "1 minute ago"; //CAN CHANGE THIS TO BE LOWER IF NEEDED
var NRQL =  "SELECT ((max(timestamp)-min(timestamp))/1000)/60 AS 'minutes', count(*),  latest(countryCode)  FROM PageView WHERE appName = '"+APP_NAME+"'  FACET session SINCE "+SINCE_CLAUSE+" LIMIT 1000";


var responseCount = 0;
var results = [];
var failureCount = 0;

//FOR DATA INSERT INTO INSIGHTS WE HAVE:
var JsonEventStart = "{\"eventType\":\"userData\",\"catagory\":\"userSessionDurations\",\"revision\":1,";
var JsonEventStop = " }";

/**

Results look like:  The result is in Minutes

{
  "facets": [
    {
      "name": "987a2839b2664772",
      "results": [
        {
          "result": 59.87433333333333
        },
        {
          "count": 120
        },
        {
          "latest": "HU"
        }
      ]
    },
    {
      "name": "5cc0eb5025f01568",
      "results": [
        {
          "result": 59.744233333333334
        },
        {
          "count": 150
        },
        {
          "latest": "PL"
        }
      ]
    },
    ......

*/


// function to query Inisghts.
function queryInsights(NRQL){ return {
  url: 'https://insights-api.newrelic.com/v1/accounts/'+ACCOUNT_ID+'/query',
  headers: {
  'Accept': 'application/json',
  'X-Query-Key': QUERY_LICENCE_KEY,
  },
  qs : {
    'nrql': NRQL
  }
};
}


// function to post to Inisghts.  Change the Account ID and the Query Licence Key for your account
function postInsights(JSONEvent){
  //console.log("Posting Event to Insights:  "+JSONEvent);
  return {
      url: 'https://insights-collector.newrelic.com/v1/accounts/'+ACCOUNT_ID+'/events',
      method: 'POST',
      //json: true,
      headers: {
      'Content-Type': 'application/json',
      'X-Insert-Key': INSERT_LICENCE_KEY
      },
      body: JSONEvent
  };
}


function createAndPostSummaryData(countryCode, totalDuration, totalMinutesPerPage, totalPageViewsInSessions, returnedResults){
  var averageDuration = totalDuration/returnedResults;
  var averageMinutesPerPage = totalMinutesPerPage/returnedResults;
  var averagePageViewsPerSession = totalPageViewsInSessions/returnedResults;
  console.log("COUNTRY CODE: "+countryCode);
  console.log("Average Session Length in Minutes = \t"+averageDuration+"\t("+averageDuration*60+" in seconds)");
  console.log("Average Minutes Per Page in Session\t"+averageMinutesPerPage+"\t("+averageMinutesPerPage*60+" in seconds)");
  console.log("Average Pages Views in Session: \t"+averagePageViewsPerSession);
  console.log("Number of sessions \t"+returnedResults);

  //Now Lets post this data to Insights
  var eventDetails = "\"site_region\":\""+countryCode+
                     "\", \"avrg_session_length_min\":"+averageDuration+
                     ", \"avrg_session_length_sec\":"+averageDuration*60+
                     ", \"avrg_time_per_page_min\":"+averageMinutesPerPage+
                     ", \"avrg_time_per_page_sec\":"+averageMinutesPerPage*60+
                     ", \"avrg_pages_per_session\":"+averagePageViewsPerSession+
                     ", \"total_sessions\":"+returnedResults;


  var thisEvent = JsonEventStart + eventDetails + JsonEventStop;
  console.log(thisEvent);

  $http.post(postInsights(thisEvent), function(error2, response2, body2) {
    assert.equal(response2.statusCode, 200, 'invalid response from INSERT to insights - DATA NOT WRITTEN TO INSIGHTS!');
    console.log("Response code from Write of event to Insights (Should be 200)= "+response2.statusCode);
  });

}


$http.get(queryInsights(NRQL), function(error, response, body) {
  //We used to check if the response was Valid - but if there is a reason this doesn't get an answer, we don't want false alerts
  //assert.equal(response.statusCode, 200, 'invalid response from insights - this monitor is no longer reliable');
  if (!error && response.statusCode == 200) {
    var jsonObj = JSON.parse(body);
    //console.log(jsonObj);
    //var jsonObj = JSON.parse(jsonString);


    //// CHECK that the number of records we get is less than or not too large compared to the limit of 1000
    var returnedResults = jsonObj.facets.length;
    console.log("The Returned Results :"+returnedResults);
    if (returnedResults >= 1000) {
      var msg = "WARNING:  We are over the allowed Match Count - you could me missing data. "+
                  "Try making the SINCE time bucket smaller.  You currently have SINCE "+SINCE_CLAUSE;
      console.log(msg);
      //assert.fail("INVALID DATA PRODUCED",msg);
    }

    var totalDuration = 0;
    var totalMinutesPerPage = 0;
    var totalPageViewsInSessions = 0;
    var dataByCountryCode = [
      {
        "countryCode":"PL",
        "totalDurationByCountry":0,
        "totalPagesInSessionByCountry":0,
        "totalMinutesPerPageByCountry":0,
        "resultsCountByCountry":0
      }
    ];

    for(var i = 0; i < returnedResults; i++) {
      var durationInMinutes = jsonObj.facets[i].results[0].result;
      var pagesInSession = jsonObj.facets[i].results[1].count;
      var minutesPerPage = (durationInMinutes/pagesInSession);
      var countryCode = jsonObj.facets[i].results[2].latest; //countryCode;

      totalDuration += durationInMinutes;
      totalMinutesPerPage += minutesPerPage;
      totalPageViewsInSessions += pagesInSession;
      //console.log(durationInMinutes, pagesInSession, minutesPerPage, countryCode);

      var countryFoundAndUpdated = false;

      for(var j=0; j<dataByCountryCode.length; j++){
        if(dataByCountryCode[j].countryCode == countryCode){
          //Update Existing data
          //console.log("UPDATING DATA FOR "+countryCode);
          dataByCountryCode[j].totalDurationByCountry = dataByCountryCode[j].totalDurationByCountry+durationInMinutes;
          dataByCountryCode[j].totalPagesInSessionByCountry = dataByCountryCode[j].totalPagesInSessionByCountry+pagesInSession;
          dataByCountryCode[j].totalMinutesPerPageByCountry = dataByCountryCode[j].totalMinutesPerPageByCountry+minutesPerPage;
          dataByCountryCode[j].resultsCountByCountry = dataByCountryCode[j].resultsCountByCountry+1;
          countryFoundAndUpdated = true;
          break;
        }
      }

      if(countryFoundAndUpdated == false){
        //Create Data for Country Code
        //console.log("WOULD NEED TO CREATE FOR "+countryCode);
        var newCountryElement = {
          "countryCode":countryCode,
          "totalDurationByCountry":durationInMinutes,
          "totalPagesInSessionByCountry":pagesInSession,
          "totalMinutesPerPageByCountry":minutesPerPage,
          "resultsCountByCountry":1
        };
        dataByCountryCode.push(newCountryElement);
      }
    }

    console.log("FINAL RESULTS");

    for (var i = 0; i < dataByCountryCode.length; i++) {
      createAndPostSummaryData(
        dataByCountryCode[i].countryCode,
        dataByCountryCode[i].totalDurationByCountry,
        dataByCountryCode[i].totalMinutesPerPageByCountry,
        dataByCountryCode[i].totalPagesInSessionByCountry,
        dataByCountryCode[i].resultsCountByCountry
      );
    }
    //FOR THE FINAL AGGREGATE NUMBERS ACROSS ALL COUNTRY CODES
    createAndPostSummaryData(
      "ALL_COUNTRIES",
      totalDuration,
      totalMinutesPerPage,
      totalPageViewsInSessions,
      returnedResults
    );
  }//end first if




});
