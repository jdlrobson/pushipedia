var level = require('level');
var db = level('./mydb');
var fetch = require('node-fetch');

function ping( ids ) {
	fetch( 'https://android.googleapis.com/gcm/send', {
		method: 'post',
		headers: {
			'Authorization': "key=" + process.env.GCM_API_KEY,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify( {
			"registration_ids": ids
		} )
	} ).then( function ( r ) {
		console.log( r.status, r.json() );
	} );
}

function broadcast( feature ) {
	var ids = [];
	db.createReadStream( {
			gt: feature + '!',
			 // stop at the last key with the prefix
			lt: feature + '\xFF',
			// TODO: Support more than 100 ids.
			limit: 100
		} ).on( 'data', function ( data ) {
			var id = data.key.split( '!' )[ 1 ];
			if ( !id ) {
				// bad data so cleanup
				db.del( data.key );
			}
			ids.push( id );
		} ).on( 'end', function () {
			ping( ids );
		} );
}

function subscribe( feature, id, errhandler ) {
	db.put( feature + '!' + id, Date.now(), errhandler );
}

function unsubscribe( feature, id, errhandler ) {
	db.del( feature + '!' + id, errhandler );
}

module.exports = {
	subscribe: subscribe,
	unsubscribe: unsubscribe,
	ping: ping,
	broadcast: broadcast
};
