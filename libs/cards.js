var fetch = require('node-fetch');
var NodeCache = require( "node-cache" );
var myCache = new NodeCache( { stdTTL: 60 * 20, checkperiod: 60 * 5 } );

/**
 * Merge two objects
 *
 * @param {Object}
 * @param {Object}
 * @return {Object}
 */
function merge( page, additionalData ) {
	var key;
	for( key in additionalData ) {
		if ( additionalData.hasOwnProperty( key ) ) {
			page[key] = additionalData[key];
		}
	}
	return page;
}

/**
 * Generates and sends a JSON for a title representing a card for display by push notification
 *
 * @param {Array} pageTitles of article to generate cards for
 * @param {String} [project] the title lives on (either commons or enwiki [default])
 */
function getJsonCards( pageTitles, project ) {
	var key = pageTitles.join( '|' );
	return new Promise( function ( resolve, reject ) {
		myCache.get( key, function( err, pages ) {
			if ( err || pages === undefined ) {
				getCardsFromServer( pageTitles, project ).then( function ( pages ) {
					myCache.set( key, pages );
					resolve( pages );
				}, function () {
					reject();
				} );
			} else {
				console.log( 'loaded from cache' );
				resolve( pages );
			}
		} );
	} );
}

/**
 * Generates and sends a JSON for a title representing a card for display by push notification
 *
 * @param {Response} resp
 * @param {String} pageTitle of article to send a push notification about
 * @param {String} [project] the title lives on (either commons or enwiki [default])
 * @param {Object} [additionalData] additional data to serve up in the JSON response
 */
function respondWithJsonCard( resp, pageTitle, project, additionalData ) {
	additionalData = additionalData || {};
	getJsonCards( [ pageTitle ], project ).then( function ( cards ) {
		resp.setHeader('Content-Type', 'application/json');
		resp.send( merge( cards[0], additionalData ) );
	}, function () {
		resp.status( 503 );
		resp.send( 'nope' );
	} );
}

/**
 * Hits an external URL running MediaWiki and generates a JSON
 * Caches results.
 *
 * @param {Array} pageTitles of article to generate cards for
 * @param {String} [project] the title lives on (either commons or enwiki [default])
 */
function getCardsFromServer( pageTitles, project ) {
	var fullUrl, titles, encodedTitles = [],
		base = 'https://en.wikipedia.org';

	pageTitles.forEach( function ( title ) {
		encodedTitles.push( encodeURIComponent( title ) );
	} );
	qs = 'action=query&pithumbsize=320&prop=pageimages|extracts&piprop=thumbnail&format=json&formatversion=2&exintro=1&explaintext=&exlimit='+ encodedTitles.length + '&pilimit=' + encodedTitles.length + '&titles=' + encodedTitles.join( '|' );
	if ( project === 'commons' ) {
		base = 'https://commons.wikimedia.org';
	}

	fullUrl = base + '/w/api.php?' + qs;

	return new Promise( function ( resolve, reject ) {
		fetch( fullUrl ).then( function ( wikiResp ) {
			if (wikiResp.status !== 200) {
				reject();
			}
			wikiResp.json().then( function ( data ) {
				var page,
					pages = data.query.pages;
				if ( pages.length ) {
					// API does it's own ordering so correct this.
					pages = pages.sort( function ( a, b ) {
						return pageTitles.indexOf( a.title ) < pageTitles.indexOf( b.title ) ? -1 : 1;
					} );
					resolve( pages );
				} else {
					reject();
				}
			} );
		} );
	} );
}

module.exports = {
	getJsonCards: getJsonCards,
	respondWithJsonCard: respondWithJsonCard
};
