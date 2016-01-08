var fetch = require('node-fetch');
function respondWithJsonCard( resp, pageTitle, project ) {
	var base = 'https://en.wikipedia.org';
	var qs = 'action=query&prop=pageimages|extracts&piprop=thumbnail&format=json&formatversion=2&explaintext=&titles=' + encodeURIComponent( pageTitle );

	if ( project === 'commons' ) {
		base = 'https://commons.wikimedia.org';
	}

	fetch( base + '/w/api.php?' + qs ).then( function ( wikiResp ) {
		if (wikiResp.status !== 200) {
			resp.status( 503 );
		}
		wikiResp.json().then( function ( data ) {
			var page,
				pages = data.query.pages;
			if ( pages.length ) {
				page = pages[0];
				resp.setHeader('Content-Type', 'application/json');
				resp.send( page );
			} else {
				resp.status( 500 );
			}
		} );
	} );
}

module.exports = {
	respondWithJsonCard: respondWithJsonCard
};
