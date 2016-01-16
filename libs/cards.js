var fetch = require('node-fetch');
var NodeCache = require( "node-cache" );
var myCache = new NodeCache( { stdTTL: 60 * 20, checkperiod: 60 * 5 } );

/**
 * Generates and sends a JSON for a title representing a card for display by push notification
 *
 * @param {Response} resp
 * @param {String} pageTitle of article to send a push notification about
 * @param {String} [project] the title lives on (either commons or enwiki [default])
 * @param {Object} [additionalData] additional data to serve up in the JSON response
 */
function respondWithJsonCard( resp, pageTitle, project, additionalData ) {
	var fullUrl,
		base = 'https://en.wikipedia.org',
		qs = 'action=query&prop=pageimages|extracts&piprop=thumbnail&format=json&formatversion=2&explaintext=&titles=' + encodeURIComponent( pageTitle );

	if ( project === 'commons' ) {
		base = 'https://commons.wikimedia.org';
	}
	additionalData = additionalData || {};

	fullUrl = base + '/w/api.php?' + qs;
	myCache.get( fullUrl, function( err, page ) {
		if ( err || page === undefined ) {
			getCardFromServer( fullUrl ).then( function ( page ) {
				// assign all values in data
				for( key in additionalData ) {
					if ( additionalData.hasOwnProperty( key ) ) {
						page[key] = additionalData[key];
					}
				}
				resp.setHeader('Content-Type', 'application/json');
				resp.send( page );
			}, function () {
				resp.status( 503 );
				resp.send( 'nope' );
			} );
		} else {
			console.log( 'load from cache', page );
			resp.setHeader('Content-Type', 'application/json');
			resp.send( page );
		}
	} );
}

/**
 * Hits an external URL running MediaWiki and generates a JSON
 * Caches results.
 *
 * @param {String} fullUrl pointing to a JSON API response
 * @return {Promise}
 */
function getCardFromServer( fullUrl ) {
	return new Promise( function ( resolve, reject ) {
		fetch( fullUrl ).then( function ( wikiResp ) {
			if (wikiResp.status !== 200) {
				reject();
			}
			wikiResp.json().then( function ( data ) {
				var page,
					pages = data.query.pages;
				if ( pages.length ) {
					page = pages[0];
					myCache.set( fullUrl, page );
					resolve( page );
				} else {
					reject();
				}
			} );
		} );
	} );
}

module.exports = {
	respondWithJsonCard: respondWithJsonCard
};
