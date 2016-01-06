var trendingEdit = false;
var io = require( 'socket.io-client' );
var subscriber = require( './subscriber' );
// David Bowie saw a surge of edits 6.38am-7.08am had 47 in 30m, 30 in 30m that followed
var EDITS_PER_HOUR = process.env.PUSHIPEDIA_TRENDING_EDITS_PER_HOUR || 30;
var NUM_EDITORS = process.env.PUSHIPEDIA_TRENDING_MINIMUM_EDITORS || 3;
var socket = io.connect('stream.wikimedia.org/rc');
var titles = {};
var start = new Date();

function isRevertOrTag( comment ) {
	return comment.indexOf( 'Tag:' ) > -1 ||
		comment.indexOf( 'vandalism' ) > -1 ||
		comment.indexOf( 'Revert' ) > -1 ||
		comment.indexOf( 'Reverting' ) > -1 ||
		comment.indexOf( 'Reverted' ) > -1;
}

function isBotEdit( data ) {
	var knownBots = [ 'ClueBot NG' ];
	return data.bot || knownBots.indexOf( data.user ) > - 1;
}

function isIP( ip ) {
	var match = ip.match( /[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+|[0-9A-E]+:[0-9A-E]+:[0-9A-E]+:[0-9A-E]+:[0-9A-E]+/ );
	return match && match[0];
}

io.connect( 'stream.wikimedia.org/rc' )
	.on( 'connect', function () {
		socket.emit( 'subscribe', 'en.wikipedia.org' );
	})
	.on( 'change', function ( data ) {
		var entity,
			title = data.title;

		// Ignore non-main namespace and anything abuse filter, revert or tag related
		if ( data.namespace !== 0 || data["log_type"] || isBotEdit( data ) || isRevertOrTag( data.comment ) ) {
			if ( data.namespace === 0 ) {
				console.log('discard', data );
			}
			return;
		}
		if ( !titles[title] ) {
			titles[title] = { edits: 1, ts: new Date(), contributors: [], anons: [] };
		} else {
			titles[title].edits++;
		}
		// if the editor is a new user add them to the list
		if ( isIP( data.user ) ) {
			if ( titles[title].anons.indexOf( data.user ) === -1 ) {
				titles[title].anons.push( data.user );
			}
		} else if ( titles[title].contributors.indexOf( data.user ) === -1 ) {
			titles[title].contributors.push( data.user );
		}

		// trending edit always refers to the most edited article
		entity = titles[title];

		// when needed we send a notification
		// Make sure enough unique users have contributed to the article to make sure it is notable
		// and certain number of edit hit
		if ( entity.contributors.length >= NUM_EDITORS && entity.edits > EDITS_PER_HOUR / 2 ) {

			if ( !trendingEdit || trendingEdit.title !== title ) {
				console.log('TREND!!!', title, data );
				trendingEdit = {
					title: title,
					data: {
						start: entity.ts,
						anonAuthors: entity.anons.length,
						uniqueAuthors: entity.contributors.length,
						edits: entity.edits
					}
				};

				// TODO: broadcast with a date as otherwise a worker will get the wrong page if it views the site a month later :)
				subscriber.broadcast( 'most-edited' );
			}
		}

	} );

function cleaner() {
	console.log( 'cleaning' );
	var i, title, passed, edits_per_min,
		target_edits_per_min = EDITS_PER_HOUR / 60,
		live = 0, purged = 0,
		now = new Date();

	for ( i in titles ) {
		if ( titles.hasOwnProperty(i) ) {
			live++;
			title = titles[i];
			passed = now - title.ts;
			// get time passed in minutes since original edit (its in milliseconds)
			passed_mins = passed / 1000 / 60;
			// work out edits per minute.
			edits_per_min = title.edits / passed_mins;

			// delete anything that's not generating the right speed of edits
			if ( edits_per_min < target_edits_per_min ) {
				// clear the trending edit
				if ( trendingEdit && trendingEdit.title === i ) {
					trendingEdit = false;
				}
				delete titles[i];
				purged++;
			}
		}
	}
	console.log( JSON.stringify( titles ) );
	console.log( 'live=', live, 'purged=', purged );
}
// cleanup every 20s
setInterval( cleaner, 1000 * 20 );

module.exports = {
	getCandidates: function () {
		var candidates = [];
		var page;
		for( title in titles ) {
			if ( titles.hasOwnProperty( title ) ) {
				page = titles[ title ];
				if ( page.edits > 2 && page.contributors.length > 1 ) {
					page.title = title;
					candidates.push( page );
				}
			}
		}
		return candidates;
	},
	getTrending: function () {
		return trendingEdit;
	}
};
