var fetch = require( 'node-fetch' );
var express = require('express');
var app = express();
var btoa = require( 'btoa' );
var lastDayRan;
// FIXME: Don't use config
var host = process.env.PUSHIPEDIA_HOST;

// Every 30 minutes check whether we should do something. Fire an event roughly every 24 hrs at 8am.
setInterval( function () {
	var d = new Date();
	var h = d.getHours();
	var day = d.getDate();

	// TODO: Make this time zone specific.
	if ( h === 8 && day !== lastDayRan ) {
		lastDayRan = day;
		console.log( 'Broadcasting out...' );
		fetch( host + '/api/broadcast', {
			method: 'post',
			headers: {
				'Authorization': 'Basic ' + btoa( "broadcaster:" + process.env.BROADCAST_SECRET )
			}
		} ).then( function ( resp ) {
			if (resp.status !== 200) {
				console.log( 'Cron failed', resp.status );
			} else {
				console.log( 'did it!');
			}
		} );
	}
}, 1000 * 60 * 30 );
