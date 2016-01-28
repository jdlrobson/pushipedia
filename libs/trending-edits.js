var level = require('level');
var trendingEdit = false;
var io = require( 'socket.io-client' );
var subscriber = require( './subscriber' );
// David Bowie saw a surge of edits 6.38am-7.08am had 47 in 30m, 30 in 30m that followed
var EDITS_PER_HOUR = process.env.PUSHIPEDIA_TRENDING_EDITS_PER_HOUR || 30;
var NUM_EDITORS = process.env.PUSHIPEDIA_TRENDING_MINIMUM_EDITORS || 4;
// Maximum bias for trending topics
var MAXIMUM_BIAS = process.env.PUSHIPEDIA_TRENDING_MAXIMUM_BIAS || 0.5;
var socket = io.connect('stream.wikimedia.org/rc');
var titles = {};
var start = new Date();
var db = level('./db-trending');
var moduleCache = level('./db-cache');

// Restore the state of the app before it last crashed
moduleCache.get( 'trend', function (err, value) {
	if (!err ) {
		titles = JSON.parse( value );
	}
} );

/**
 * @param {Integer} limit of historical items to get
 * @return {Promise}
 */
function getHistory( limit ) {
	return new Promise( function ( resolve ) {
		var result = []
		db.createValueStream( {
			limit: limit || 50,
			reverse: true
		} ).on( 'data', function ( value ) {
			result.push( JSON.parse( value ) );
		} ).on( 'end', function () {
			resolve( result );
		} );
	} );
}

/**
 * Checks if the current edit tells us that vandalism has occurred.
 *
 * @param {Object} currentEdit current edit entity
 * @return {Boolean} whether the comment indicates vandalism has occurred.
 */
function isVandalism( edit ) {
	return edit.comment.toLowerCase().indexOf( 'vandalism' ) > -1;
}

/**
 * Heuristic to try and guess that vandalism is occurring.
 *
 * @param {Object} edits history entity
 * @param {Object} currentEdit current edit entity
 * @return {Boolean}
 */
function isPossibleVandalism( edits, currentEdit ) {
	// If high level of reverts happening assume it is (note reverts not counted in edits)
	return edits.reverts / edits.edits > 0.7 ||
		// a little unfair but high amount of anon authors suggested it could be vandalism
		edits.anonAuthors / 2 >= edits.uniqueAuthors ||
		// look for cases where anon edits are higher and there has been at least 2 reverts
		edits.reverts > 1 && edits.anonEdits > edits.edits - edit.anonEdits;
}

/**
 * @param {String} comment associated with edit
 * @return {Boolean} whether the comment indicates the edit is a revert or a tag.
 */
function isRevert( comment ) {
	return comment.indexOf( 'Tag:' ) > -1 ||
		comment.indexOf( 'Undid' ) > -1 ||
		comment.indexOf( 'Revert' ) > -1 ||
		comment.indexOf( 'Reverting' ) > -1 ||
		comment.indexOf( 'WP:' ) > -1 ||
		comment.indexOf( 'Reverted' ) > -1;
}

/**
 * @param {String} comment associated with edit
 * @return {Boolean} whether the comment indicates the edit fixed a previous bad edit.
 */
function isFixup( comment ) {
	return comment.indexOf( 'Fixed error' ) > -1;
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
 * Does the edit suggest the article is new
 *
 * @param {Object} edit
 * @return {Boolean}
 */
function isNew( edit ) {
	return edit.comment.indexOf( 'Created page' ) > -1;
}

/**
 * Does the edit suggest the article's future is volatile?
 *
 * @param {Object} edit
 * @return {Boolean}
 */
function isVolatile( edit ) {
	return edit.comment.indexOf( 'Proposing article for deletion' ) > -1;
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

		// Ignore non-main namespace and anything abuse filter or tag related
		if ( data.namespace !== 0 || data["log_type"] || isBotEdit( data ) || isFixup( data.comment ) ) {
			return;
		}
		// Store everything else
		if ( !titles[title] ) {
			titles[title] = { edits: 1, anonEdits: 0,
				isVandalism: false,
				isNew: false,
				isVolatile: false,
				reverts: 0,
				start: new Date(), contributors: [], anons: [], distribution: {} };
		} else {
			if ( isRevert( data.comment ) ) {
				// don't count edits but note the revert.
				titles[title].reverts += 1;
				return;
			}
			titles[title].edits++;
		}

		// trending edit always refers to the most edited article
		entity = titles[title];

		// When something has been called out as vandalism make sure to mark it
		if ( isVandalism( data ) ) {
			entity.isVandalism = true;
		}

		// When something has been called out as vandalism make sure to mark it
		if ( isNew( data ) ) {
			entity.isNew = true;
		}

		// When something has been called out as vandalism make sure to mark it
		if ( isVolatile( data ) ) {
			entity.isVolatile = true;
		}

		// if the editor is a new user add them to the list
		// @todo: use entity in this block
		if ( isIP( data.user ) ) {
			titles[title].anonEdits +=1;
			if ( titles[title].anons.indexOf( data.user ) === -1 ) {
				titles[title].anons.push( data.user );
				titles[title].distribution[data.user] = 1;
			} else {
				titles[title].distribution[data.user]++;
			}
		} else {
			var index = titles[title].contributors.indexOf( data.user );
			if ( index === -1 ) {
				titles[title].contributors.push( data.user );
				titles[title].distribution[data.user] = 1;
			} else {
				titles[title].distribution[data.user]++;
			}
		}

		// when needed we send a notification
		// Make sure enough unique users have contributed to the article to make sure it is notable
		// and certain number of edit hit

		var now = new Date();
		passed_mins = ( now - entity.start ) / 1000 / 60;
		entity.speed = entity.edits / passed_mins;
		entity.anonAuthors = entity.anons.length;
		entity.uniqueAuthors = entity.contributors.length;

		trendingCandidate = {
			title: title,
			data: {}
		};
		Object.keys( entity ).forEach( function ( i ) {
			trendingCandidate.data[i] = entity[i];
		} );

		var bias = 0;
		var authors = 0;
		for ( user in entity.distribution ) {
			if ( entity.distribution.hasOwnProperty( user ) ) {
				authors += 1;
				bias += entity.distribution[user];
			}
		}
		// completely biased is 1. 0 is unbiased (nothing is unbiased :-))
		bias = ( bias / authors ) / entity.edits;
		trendingCandidate.data.bias = bias;
		entity.bias = bias;

		var counted_editors = entity.anons.length ? 1 + entity.contributors.length : entity.contributors.length;
		if ( bias > MAXIMUM_BIAS || entity.isVandalism || isPossibleVandalism( entity ) ) {
			// ignore
		} else if ( !entity.isVolatile && counted_editors >= NUM_EDITORS && entity.edits > EDITS_PER_HOUR / 2 ) {

			if ( !trendingEdit || trendingEdit.title !== title ) {
				console.log('TREND!!!', title, data );
				trendingEdit = trendingCandidate;
				trendingEdit.data.level = 3;
				trendingEdit.data.trendedAt = now;

				// Check it's not a duplicate of a recent trend
				// If two items are trending at the same time for a sustained period of time
				// multiple pushes might get sent.
				getHistory().then( function ( data ) {
					var pushNeeded = true;
					data.forEach( function ( trending ) {
						if ( trending.title === trendingEdit.title ) {
							pushNeeded = false;
						}
					} );
					if ( pushNeeded ) {
						// TODO: broadcast with a date as otherwise a worker will get the wrong page if it views the site a month later :)
						subscriber.broadcast( 'most-edited' );
						db.put( Date.now(), JSON.stringify( trendingEdit ) );
					}
				} );
			}
		} else if ( trendingEdit && trendingEdit.data.level < 3 ) {
			if ( trendingEdit.data.edits === trendingCandidate.data.edits &&
				trendingCandidate.data.bias < trendingEdit.data.bias ) {
				trendingEdit = trendingCandidate;
				trendingEdit.data.level = 2;
			} else if ( trendingEdit.data.edits < trendingCandidate.data.edits ) {
				trendingEdit = trendingCandidate;
				trendingEdit.data.level = 2;
			}
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
			passed = now - new Date( title.start );
			// get time passed in minutes since original edit (its in milliseconds)
			passed_mins = passed / 1000 / 60;
			// work out edits per minute.
			edits_per_min = title.edits / passed_mins;

			// delete anything that's not generating the right speed of edits
			if ( ( edits_per_min < target_edits_per_min )
				// if we known something had vandalism drop it
				|| title.isVandalism
				// anything over 2 hours is way too old
				|| ( passed_mins > 120 ) ) {
				delete titles[i];
				purged++;
			} else {
				// track the new speed / duration
				titles[i].duration = passed_mins;
				titles[i].speed = edits_per_min;
			}
		}
	}

	var json = JSON.stringify( titles );
	console.log( 'target speed', target_edits_per_min );
	moduleCache.put( 'trend', json );
	console.log( 'live=', live, 'purged=', purged );
}
// cleanup every 20s
setInterval( cleaner, 1000 * 20 );

module.exports = {
	getHistory: getHistory,
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
