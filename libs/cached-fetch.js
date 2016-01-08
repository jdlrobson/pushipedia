var fetch = require('node-fetch');
var NodeCache = require( "node-cache" );

// Cache all requests for 2 hour period
var cache = new NodeCache( { stdTTL: 60 * 60 * 60 * 2 } );

function cachedFetch( url ) {
	var cachedResponse = cache.get( url );
	if ( !cachedResponse ){
		return fetch( url ).then( function ( wikiResp ) {
			if ( wikiResp.status === 200 ) {
				cache.set( url, wikiResp );
			}
			return wikiResp;
		} );
	} else {
		return new Promise( function ( resolve, reject ) {
			resolve( cachedResponse );
		} ).then( function () {
			return cachedResponse;
		} );
	}
}

module.exports = cachedFetch;
