var trendingEdit = false;
var io = require( 'socket.io-client' );
var subscriber = require( './subscriber' );
// David Bowie saw a surge of edits 6.38am-7.08am had 47 in 30m, 30 in 30m that followed
var EDITS_PER_HOUR = process.env.PUSHIPEDIA_TRENDING_EDITS_PER_HOUR || 30;
var NUM_EDITORS = process.env.PUSHIPEDIA_TRENDING_MINIMUM_EDITORS || 4;
var socket = io.connect('stream.wikimedia.org/rc');
var titles = {};
var start = new Date();

/**
 * @param {String} comment associated with edit
 * @return {Boolean} whether the comment indicates the edit is a revert or a tag.
 */
function isRevertOrTag( comment ) {
	return comment.indexOf( 'Tag:' ) > -1 ||
		comment.indexOf( 'Undid' ) > -1 ||
		comment.indexOf( 'vandalism' ) > -1 ||
		comment.indexOf( 'Revert' ) > -1 ||
		comment.indexOf( 'Reverting' ) > -1 ||
		comment.indexOf( 'Reverted' ) > -1;
}

/**
 * @param {Object} edit
 * @return {Boolean} whether the edit was performed by a bot.
 */
function isBotEdit( edit ) {
	// Some bots are not marked as a bot.
	var knownBots = [ 'ClueBot NG' ];
	return edit.bot || knownBots.indexOf( edit.user ) > - 1;
}

/**
 * @param {String} user which can be an ip or username
 * @return {Boolean} whether the username indicates an IP thus anon edit.
 */
function isIP( user ) {
	var match = user.match( /[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+|[0-9A-E]+:[0-9A-E]+:[0-9A-E]+:[0-9A-E]+:[0-9A-E]+/ );
	return match && match[0];
}

// Connect to the websocket and start tracking.
io.connect( 'stream.wikimedia.org/rc' )
	.on( 'connect', function () {
		socket.emit( 'subscribe', 'en.wikipedia.org' );
	})
	.on( 'change', function ( data ) {
		var entity, trendingCandidate, passed_mins,
			title = data.title;

		// Ignore non-main namespace and anything abuse filter, revert or tag related
		if ( data.namespace !== 0 || data["log_type"] || isBotEdit( data ) || isRevertOrTag( data.comment ) ) {
			return;
		}
		// Store everything else
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

		passed_mins = ( new Date() - entity.ts ) / 1000 / 60;
		trendingCandidate = {
			title: title,
			data: {
				start: entity.ts,
				speed: entity.edits / passed_mins,
				anonAuthors: entity.anons.length,
				uniqueAuthors: entity.contributors.length,
				edits: entity.edits
			}
		};

		var counted_editors = entity.anons.length ? 1 + entity.contributors.length : entity.contributors.length;
		if ( counted_editors >= NUM_EDITORS && entity.edits > EDITS_PER_HOUR / 2 ) {

			if ( !trendingEdit || trendingEdit.title !== title ) {
				console.log('TREND!!!', title, data );
				trendingEdit = trendingCandidate;
				trendingEdit.data.level = 3;

				// TODO: broadcast with a date as otherwise a worker will get the wrong page if it views the site a month later :)
				subscriber.broadcast( 'most-edited' );
			}
		} else if ( trendingEdit && trendingEdit.data.level < 3 && trendingEdit.data.edits < trendingCandidate.data.edits ) {
			trendingEdit = trendingCandidate;
			trendingEdit.data.level = 2;
		} else if ( !trendingEdit ) {
			trendingEdit = trendingCandidate;
			trendingEdit.data.level = 1;
		}

	} );

/**
 * Internal clean process. Ensures we don't store edits for longer than necessary.
 */
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
	/**
	 * @return {Array} of candidates for trending at any given time.
	 */
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
	/**
	 * @return {Object} representing the current trending edit
	 */
	getTrending: function () {
		return trendingEdit;
	}
};
