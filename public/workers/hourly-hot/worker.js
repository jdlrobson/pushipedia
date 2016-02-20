self.addEventListener( 'push', function( event ) {
	var icon = 'https://en.m.wikipedia.org/static/apple-touch/wikipedia.png';
	var tag = 'wikimedia-editor-notification';

	fetch( '/api/articles/hourly-hot' ).then( function ( resp ) {
		if (resp.status !== 200) {
			// Nothing more to do.
			return;
		}
		resp.json().then( function ( page ) {
			var mins = Math.floor( ( new Date( page.trendedAt ) - new Date( page.start ) ) / 1000 / 60 );
			self.registration.showNotification( page.title + ' is hot!', {
				body: page.title + " has been receiving the most edits in the past hour.\n\n" + page.extract,
				icon: page.thumbnail ? page.thumbnail.source : icon,
				tag: tag,
				data: 'https://en.wikipedia.org/wiki/' + page.title + '?referrer=pushipedia'
		 } );
		} );
	} );
} );

self.addEventListener( 'notificationclick', function( event ) {
  // Android doesnâ€™t close the notification when you click on it
  // See: http://crbug.com/463146
  event.notification.close();
	return clients.openWindow(event.notification.data);
} );
