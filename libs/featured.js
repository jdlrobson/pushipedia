var fetch = require('node-fetch');

/**
 * Obtains the picture of the current day.
 *
 * @return {Promise| being passed the title of the picture of the day
 */
function potd() {
	return new Promise( function ( resolve, reject ) {
		var d = new Date();
		var month = d.getMonth() + 1;
		var day = d.getDate();
		day = day < 10 ? '0' + day : day;
		month = month < 10 ? '0' + month : month;
		var date = d.getFullYear() + '-' +  month + '-' + day;
		var qs = 'action=query&prop=images&format=json&formatversion=2&titles=Template%3APotd%2F' + date;

		return fetch( 'https://commons.wikimedia.org/w/api.php?' + qs ).then( function ( wikiResp ) {
			if (wikiResp.status !== 200) {
				resp.status( 503 );
			}
			wikiResp.json().then( function ( data ) {
				var page, images,
					title = false,
					pages = data.query.pages;
				if ( pages.length ) {
					images = pages[0].images;
					if ( images.length ) {
						resolve( images[0].title );
					} else {
						reject();
					}
				} else {
					reject();
				}
			} );
		} );
	} );
}

/**
 * Obtains a title representing the summary of today's featured article
 * Lazy implementation - ideally should return title of page itself.
 *
 * @return {String} title in project namespace of today's featured article
 */
function tfa() {
	var d = new Date();
	var month = [ 'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December' ][ d.getMonth() ];
	var pageTitle = 'Wikipedia:Today\'s_featured_article/' + month + '_' + d.getDate() + ',_' + d.getFullYear();
	return pageTitle;
}

module.exports = {
	potd: potd,
	tfa: tfa
};
