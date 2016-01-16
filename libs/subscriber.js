var level = require('level');
var db = level('./mydb');
var fetch = require('node-fetch');

function isKnownProvider( provider ) {
	return provider === 'google' || provider === 'firefox';
}

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
		body = JSON.stringify( {
			"registration_ids": ids
		} );
		pingEndpoint( endpoint, headers, body );
	} else if ( provider === 'firefox' ) {
		for( i = 0; i < ids.length; i++ ) {
			endpoint = 'https://updates.push.services.mozilla.com/push/' + ids[i];
			pingEndpoint( endpoint );
		}
	} else {
		throw 'Endpoint is unknown: ' + provider;
	}
}

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
			lt: prefix + feature + '\xFF',
			// TODO: Support more than 100 ids.
			limit: 100
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
}

function broadcast( feature ) {
	// for backwards compatibility
	broadcastForEndpoint( feature, '' );
	broadcastForEndpoint( feature, 'google' );
	broadcastForEndpoint( feature, 'firefox' );
}


function subscribe( provider, feature, id, errhandler ) {
	if ( !isKnownProvider( provider ) ) {
		throw 'Unknown provider'  + provider;
	}
	db.put( provider + '!' + feature + '!' + id, Date.now(), errhandler );
}

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
