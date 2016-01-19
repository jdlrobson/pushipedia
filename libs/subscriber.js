var level = require('level');
var db = level('./mydb');
var fetch = require('node-fetch');

/**
 * Checks whether we have support for the given provider
 *
 * @param {String} provider of push notifications (firefox or chrome)
 * @returns {Boolean} whether we support it or not
 */
function isKnownProvider( provider ) {
	return provider === 'google' || provider === 'firefox';
}

/**
 * Obtains the picture of the current day.
 *
 * @param {String} provider of push notifications (firefox or chrome)
 * @param {Array} of ids that need push notifications sent to them
 */
function ping( provider, ids ) {
	var i, endpoint,
		body = {},
		headers = {
			'Content-Type': 'application/json'
		};

	// Assume google if not given
	provider = provider || 'google';

	if ( provider === 'google' ) {
		endpoint = 'https://android.googleapis.com/gcm/send';
		headers.Authorization = "key=" + process.env.GCM_API_KEY;
		// send them 50 at a time
		for( i = 0; i < ids.length; i = i + 50 ) {
			body = JSON.stringify( {
				"registration_ids": ids.slice(i, 50)
			} );
			pingEndpoint( endpoint, headers, body );
		}
	} else if ( provider === 'firefox' ) {
		for( i = 0; i < ids.length; i++ ) {
			endpoint = 'https://updates.push.services.mozilla.com/push/' + ids[i];
			pingEndpoint( endpoint );
		}
	} else {
		throw 'Endpoint is unknown: ' + provider;
	}
}

/**
 * Pings an endpoint with headers and bodys
 *
 * @param {String} url to ping
 * @param {Headers} headers for request
 * @param {String} body of request
 */
function pingEndpoint( endpoint, headers, body ) {
	var params = {
		method: 'post',
		headers: headers,
		body: body
	};
	if ( headers ) {
		params.headers = headers;
	}
	if ( body ) {
		params.body = body;
	}
	fetch( endpoint, params ).then( function ( r ) {
		console.log( r.status, r.json() );
	} );
}

/**
 * For a given feature sends push notifications to all subscribers
 *
 * @param {String} feature
 * @param {String} provider
 */
function broadcastForEndpoint( feature, provider ) {
	var prefix,
		index = 3,
		ids = [];

	// provider may be absent for backwards compatibility reasons
	if ( provider ) {
		index = 2;
		prefix = provider + '!';
	}

	db.createReadStream( {
			gt: prefix + feature + '!',
			 // stop at the last key with the prefix
			lt: prefix + feature + '\xFF'
		} ).on( 'data', function ( data ) {
			var id = data.key.split( '!' )[ index ];
			if ( !id ) {
				// bad data so cleanup
				db.del( data.key );
			}
			ids.push( id );
		} ).on( 'end', function () {
			ping( provider, ids );
		} );
		console.log( 'pinged ' + ids.length + ' subscribers' )
}

/**
 * Broadcast to all subscribers that a current feature has had updates
 *
 * @param {String} feature
 */
function broadcast( feature ) {
	// for backwards compatibility
	broadcastForEndpoint( feature, '' );
	broadcastForEndpoint( feature, 'google' );
	broadcastForEndpoint( feature, 'firefox' );
}

/**
 * Add a subscription
 *
 * @param {String} provider
 * @param {String} feature
 * @param {String} id
 * @param {Function} errhandler what to do when things go wrong
 */
function subscribe( provider, feature, id, errhandler ) {
	if ( !isKnownProvider( provider ) ) {
		throw 'Unknown provider'  + provider;
	}
	db.put( provider + '!' + feature + '!' + id, Date.now(), errhandler );
}

/**
 * Remove a subscription
 *
 * @param {String} provider
 * @param {String} feature
 * @param {String} id
 * @param {Function} errhandler what to do when things go wrong
 */
function unsubscribe( provider, feature, id, errhandler ) {
	if ( !isKnownProvider( provider ) ) {
		throw 'Unknown provider'  + provider;
	}
	db.del( provider + '!' + feature + '!' + id, errhandler );
}

module.exports = {
	subscribe: subscribe,
	unsubscribe: unsubscribe,
	ping: ping,
	broadcast: broadcast
};
