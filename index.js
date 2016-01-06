var express = require('express');
var basicAuth = require('basic-auth');
var app = express();
var fetch = require('node-fetch');
var bodyParser = require('body-parser');
var pageviews = require('pageviews');
var cards = require( './libs/cards' );
var subscriber = require( './libs/subscriber' );

// Auth
var auth = function (req, res, next) {
	var user = basicAuth(req);
	if (!user || !user.name || !user.pass) {
		return res.send(401).end();
	} else {
		if (user.name === 'broadcaster' && user.pass === process.env.BROADCAST_SECRET) {
			return next();
		} else {
			return res.send(401).end();
		};
 }
};

app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

app.set('port', (process.env.PORT || 5000));

app.use(express.static(__dirname + '/public'));

// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.get('/', function ( req, resp ) {
  resp.render( 'pages/index' );
});

app.get('/manifest.json', function ( req, resp ) {
	resp.setHeader('Content-Type', 'application/json');
	resp.send( {
		"gcm_sender_id": process.env.GCM_SENDER_ID
	} );
});

app.post( '/api/broadcast', auth, function ( req, resp ) {
	console.log( 'broadcasting...' );
	subscriber.broadcast( 'tfa' );
	subscriber.broadcast( 'potd' );
	subscriber.broadcast( 'yta' );
	resp.setHeader('Content-Type', 'text/plain' );
	resp.status( 200 );
	resp.send( 'OK' );
} );

app.post( '/api/preview', function ( req, resp ) {
	var id = req.body.id;
	if ( !id ) {
		resp.status( 400 );
		resp.send( 'FAIL' );
	} else {
		resp.setHeader('Content-Type', 'text/plain' );
		subscriber.ping( [ id ] );
		resp.status( 200 );
		resp.send( 'OK' );
	}
} );

app.post('/api/unsubscribe', function( req, resp ) {
	var feature = req.body.feature;
	var id = req.body.id;
	if ( !feature || !id ) {
		resp.status( 400 );
		resp.send( 'FAIL' );
	}
	resp.setHeader('Content-Type', 'text/plain' );
	subscriber.unsubscribe( feature, req.body.id );
} );

app.post('/api/subscribe', function( req, resp ) {
	var feature = req.body.feature;
	var id = req.body.id;
	if ( !feature || !id ) {
		resp.status( 400 );
		resp.send( 'FAIL' );
	}
	resp.setHeader('Content-Type', 'text/plain' );

	subscriber.subscribe( feature, id, function ( err ) {
		if ( err ) {
			resp.send( 'FAIL' );
			resp.status( 503 );
		} else {
			resp.send( 'OK' );
		}
	} );
});

app.get('/api/articles/potd', function ( req, resp ) {
	var d = new Date();
	var month = d.getMonth() + 1;
	var day = d.getDate();
	day = day < 10 ? '0' + day : day;
	month = month < 10 ? '0' + month : month;
	var date = d.getFullYear() + '-' +  month + '-' + day;
	var qs = 'action=query&prop=images&format=json&formatversion=2&titles=Template%3APotd%2F' + date;
	fetch( 'https://commons.wikimedia.org/w/api.php?' + qs ).then( function ( wikiResp ) {
		if (wikiResp.status !== 200) {
			resp.status( 503 );
		}
		wikiResp.json().then( function ( data ) {
			var page, images,
				pages = data.query.pages;
			if ( pages.length ) {
				images = pages[0].images;
				if ( images.length ) {
					console.log(images[0]);
					console.log('boom');
					cards.respondWithJsonCard( resp, images[0].title );
				} else {
					resp.status( 500 );
				}
			} else {
				resp.status( 500 );
			}
		} );
	} );
} );

app.get('/api/articles/tfa', function ( req, resp ) {
	console.log( 'get tfa' );
	var d = new Date();
	var month = [ 'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December' ][ d.getMonth() ];
	var pageTitle = 'Wikipedia:Today\'s_featured_article/' + month + '_' + d.getDate() + ',_' + d.getFullYear();
	cards.respondWithJsonCard( resp, pageTitle );
} );

app.get('/api/articles/yta', function ( req, resp ) {
	console.log( 'get yta' );
	var d = new Date();
	var month = d.getMonth() + 1;
	var day = d.getDate() - 1;
	pageviews.getTopPageviews({
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

		cards.respondWithJsonCard( resp, topArticle.article );
	}).catch(function(error) {
		console.log(error);
		resp.status( 500 );
		resp.send( 'fail' )
	});
} );

app.listen( app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
} );


