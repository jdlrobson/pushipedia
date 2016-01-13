'use strict';
function getSubscriptionId( endpoint ) {
	return endpoint.split( 'https://android.googleapis.com/gcm/send/' )[1];
}

function sendSubscriptionToServer( subscription, action, feature ) {
	var id = getSubscriptionId( subscription.endpoint );
	action = action || 'subscribe';
	fetch( '/api/' + action, {
		method: 'post',
		headers: {
			'Accept': 'application/json',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify( {
			id: id,
			feature: feature
		} )
	} );
}

WikiWorker.prototype.unsubscribe = function ( feature ) {
	var wikiWorker = this;
	var pushButton = this.pushButton;
	pushButton.disabled = true;

	this.getRegisteredWorker().then( function ( serviceWorkerRegistration ) {
		// To unsubscribe from push messaging, you need get the
		// subcription object, which you can call unsubscribe() on.
		serviceWorkerRegistration.pushManager.getSubscription().then(
			function ( pushSubscription ) {
				// Check we have a subscription to unsubscribe
				if (!pushSubscription) {
					wikiWorker.isEnabled = false;
					pushButton.disabled = false;
					pushButton.textContent = 'Enable Push Messages';
					return;
				}

				sendSubscriptionToServer( pushSubscription, 'unsubscribe', feature );

				// We have a subcription, so call unsubscribe on it
				pushSubscription.unsubscribe().then( function ( successful ) {
					pushButton.disabled = false;
					pushButton.textContent = 'Enable Push Messages';
					wikiWorker.isEnabled = false;
					wikiWorker.disablePreview();
				} ).catch( function ( e ) {
					// We failed to unsubscribe, this can lead to
					// an unusual state, so may be best to remove
					// the subscription id from your data store and
					// inform the user that you disabled push

					console.log( 'Unsubscription error: ', e );
					pushButton.disabled = false;
				} );
			} ).catch( function ( e ) {
				console.log( 'Error thrown while unsubscribing from ' +
					'push messaging.', e );
			} );
	} );
};

WikiWorker.prototype.disablePreview = function () {
	if ( this.previewButton ) {
		this.previewButton.parentNode.removeChild( this.previewButton );
	}
	this.previewButton = undefined;
};

WikiWorker.prototype.showPreviewButton = function ( endpoint ) {
	var pushButton = this.pushButton;
	var previewButton = this.previewButton;
	if ( !previewButton ) {
		previewButton = document.createElement( 'button' );
		previewButton.textContent = 'Preview';
		pushButton.parentNode.insertBefore( previewButton, pushButton.nextSibling );
		previewButton.addEventListener( 'click', function () {
			this.disabled = true;
			fetch( '/api/preview', {
				method: 'post',
				headers: {
					'Accept': 'application/json',
					'Content-Type': 'application/json'
				},
				body: JSON.stringify( {
					id: getSubscriptionId( endpoint )
				} )
			} ).then( function () {
				previewButton.disabled = false;
			});
		} );
		this.previewButton = previewButton;
	}
};

WikiWorker.prototype.subscribe = function ( feature ) {
	var wikiWorker = this;
	var pushButton = this.pushButton;

	// Disable the button so it can't be changed while
	// we process the permission request
	pushButton.disabled = true;

	this.getRegisteredWorker().then( function ( serviceWorkerRegistration ) {
		serviceWorkerRegistration.pushManager.subscribe( {
			userVisibleOnly: true
		} )
			.then( function ( subscription ) {
				wikiWorker.isEnabled = true;
				pushButton.textContent = 'Disable Push Messages';
				pushButton.disabled = false;
				wikiWorker.showPreviewButton( subscription.endpoint );

				// TODO: Send the subscription subscription.endpoint
				// to your server and save it to send a push message
				// at a later date
				return sendSubscriptionToServer( subscription, 'subscribe', feature );
			})
			.catch( function ( e ) {
				if ( Notification.permission === 'denied' ) {
					// The user denied the notification permission which
					// means we failed to subscribe and the user will need
					// to manually change the notification permission to
					// subscribe to push messages
					pushButton.disabled = true;
				} else {
					// A problem occurred with the subscription, this can
					// often be down to an issue or lack of the gcm_sender_id
					// and / or gcm_user_visible_only
					pushButton.disabled = false;
					pushButton.textContent = 'Enable Push Messages';
				}
			} );
	} );
}

WikiWorker.prototype.toggleSubscription = function ( feature ) {
	if ( Notification.permission !== 'granted' ) {
		this.pushButton.textContent = 'Permission needed to enable push messages';
	}
	if ( this.isEnabled ) {
		this.unsubscribe( feature );
	} else {
		this.subscribe( feature );
	}
};

WikiWorker.prototype.getRegisteredWorker = function () {
	var wikiworker = this;
	var promise = new Promise( function( resolve, reject ) {
	  resolve( wikiworker.registration );
	} );
	return promise;
};

// Once the service worker is registered set the initial state

function WikiWorker( serviceWorkerRegistration, pushButton, feature ) {
	var wikiWorker = this;

	this.registration = serviceWorkerRegistration;
	this.pushButton = pushButton;

	// Check the current Notification permission.
	// If its denied, it's a permanent block until the
	// user changes the permission
	if ( Notification.permission === 'denied' ) {
		return;
	}

	// Do we already have a push message subscription?
	serviceWorkerRegistration.pushManager.getSubscription()
		.then( function ( subscription ) {
			// Enable any UI which subscribes / unsubscribes from
			// push messages.
			pushButton.disabled = false;

			if ( !subscription ) {
				// We aren’t subscribed to push, so set UI
				// to allow the user to enable push
				return;
			}

			// Keep your server in sync with the latest subscription
			sendSubscriptionToServer( subscription, 'subscribe', feature );

			// Set your UI to show they have subscribed for
			// push messages
			pushButton.textContent = 'Disable Push Messages';
			wikiWorker.isEnabled = true;
			wikiWorker.showPreviewButton( subscription.endpoint );
		} )
		.catch( function ( err )  {
			console.log( 'Error during getSubscription()', err );
		} );
}

function initPushButton( pushButton ) {
	var feature = pushButton.getAttribute( 'data-feature' ),
		scope = '/workers/' + feature + '/';

	pushButton.addEventListener( 'click', function () {
		this.worker.toggleSubscription( feature );
	} );

	navigator.serviceWorker.register( scope + 'worker.js', {
		scope: scope
	} )
	.then( function ( r ) {
		pushButton.worker = new WikiWorker( r, pushButton, feature );
	} );
}

window.addEventListener( 'load', function () {
	var i, features,
		serviceWorkerSupport = 'serviceWorker' in navigator,
		pushManagerSupport = 'PushManager' in window,
	notificationSupport = serviceWorkerSupport && 'showNotification' in ServiceWorkerRegistration.prototype;
	// Check that service workers are supported, if so, progressively
	// enhance and add push messaging support, otherwise continue without it.
	if ( serviceWorkerSupport && pushManagerSupport && notificationSupport ) {
		var btns = document.querySelectorAll( '.js-push-button' );
		Array.prototype.forEach.call( btns, function ( btn ) {
			initPushButton( btn );
		} );
	} else {
		features = document.getElementsByClassName( 'feature' );
		// purposely don't use forEach in case there browser completely sucks.
		for ( i = 0; i < features.length; i++ ) {
			features[i].setAttribute( 'style', 'opacity:0.5');
		}
		document.getElementById( 'browser-error' ).setAttribute( 'style', 'display:block;');
	}
} );
