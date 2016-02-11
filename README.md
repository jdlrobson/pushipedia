# Pushipedia

Notifications for Wikipedia using [Express 4](http://expressjs.com/).

## Running Locally

Make sure you have [Node.js](http://nodejs.org/) installed.

```sh
$ export GCM_API_KEY=<your key>
$ export GCM_SENDER_ID=<your id>
$ export BROADCAST_SECRET=<your secret code>
$ export PUSHIPEDIA_HOST=<e.g. http://localhost:8142/>
$ export PUSHIPEDIA_HTTPS=true
$ cd pushipedia
$ npm install
$ npm start
```

Your app should now be running on your default port e.g. [localhost:5000](http://localhost:5000/).

Once subscribed to a notification trigger it with
```sh
curl --request POST $PUSHIPEDIA_HOST/api/broadcast -u broadcaster:$BROADCAST_SECRET
```
Alternatively you can trigger push notifications for an individual feature using:
```
curl --request POST --data feature=yta $PUSHIPEDIA_HOST/api/broadcast -u broadcaster:$BROADCAST_SECRET
```

You can use npm forever to keep Pushipedia up and running on a production server.

## Configure

```sh
$ export PUSHIPEDIA_TRENDING_EDITS_PER_HOUR=5
````

## Deploying to Heroku

If deploying to heroku:
```
$ heroku create
$ git push heroku master
$ heroku open
```

