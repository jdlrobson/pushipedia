var express = require('express');
var basicAuth = require('basic-auth');
var app = express();
var fetch = require('node-fetch');
var bodyParser = require('body-parser');
var cards = require( './libs/cards' );
var subscriber = require( './libs/subscriber' );
var topPages = require( './libs/top-pages' );
var featured = require( './libs/featured' );

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
	var feature = req.body.feature;
	if ( feature ) {
		subscriber.broadcast( feature );
	} else {
		subscriber.broadcast( 'tfa' );
		subscriber.broadcast( 'potd' );
		subscriber.broadcast( 'yta' );
	}
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
	subscriber.unsubscribe( feature, req.body.id, function ( err ) {
		if ( err ) {
			resp.send( 'FAIL' );
			resp.status( 503 );
		} else {
			resp.send( 'OK' );
		}
	} );
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
	featured.potd().then( function ( title ) {
		cards.respondWithJsonCard( resp, title );
	} ).catch( function () {
		resp.status( 500 );
	} );
} );

app.get('/api/articles/tfa', function ( req, resp ) {
	featured.tfa().then( function ( title ) {
		cards.respondWithJsonCard( resp, title );
	} ).catch( function () {
		resp.status( 500 );
	} );
} );

app.get('/api/articles/yta', function ( req, resp ) {
	topPages.getFilteredTop().then( function ( title ) {
		cards.respondWithJsonCard( resp, title );
	}).catch(function(error) {
		console.log(error);
		resp.status( 500 );
		resp.send( 'fail' )
	});
} );

app.listen( app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
} );


