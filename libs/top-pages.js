var pageviews = require('pageviews');

function getFilteredTop() {
	var d = new Date();
	var month = d.getMonth() + 1;
	var day = d.getDate() - 1;
	return pageviews.getTopPageviews({
		project: 'en.wikipedia',
		year: d.getFullYear(),
		month: month,
		day: day,
		limit: 15
	}).then(function(result) {
		var topArticle;
		var blacklist = [ 'Main_Page', 'Web_scraping', 'Special:', '-', 'Talk:', 'User:' ];

		// filter out
		result.items[0].articles.forEach( function ( item ) {
			var clean = true;
			blacklist.forEach( function ( term ) {
				if ( item.article.indexOf( term ) > -1 ) {
					clean = false;
				}
			} );
			if ( !topArticle && clean ) {
				topArticle = item;
			}
		} );
		return topArticle.article;
	} );
}

module.exports = {
	getFilteredTop: getFilteredTop
};
