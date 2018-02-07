// You have to use strict to try this in Node
"use strict";

const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const workerpool = require('workerpool');
// const spawn = require('child_process').spawn;
const pool = workerpool.pool();
const uuidv4 = require('uuid/v4');
const fs = require('fs');

// configure app to use bodyParser()
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const port = process.env.PORT || 8080;

// Routes:
// =============================================================================
const router = express.Router();

router.get('/ping', function(req, res) {
  res.json({ message: 'all ok !' });
});

router.get('/png', getImage);

// Register routes
app.use('', router);

// Main

function generateSnap(filename, url, selector, viewport) {
  const puppeteer = require('puppeteer');

  return (async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    if (viewport) {
      viewport = decodeURIComponent(viewport);
      viewport = JSON.parse(viewport);
      // console.log(viewport);
      const targetViewport = Object.assign({}, viewport);

      // console.log(targetViewport);
      await page.setViewport(targetViewport);
    }
    await page.goto(url, {waitUntil: 'networkidle0'});
    // await Promise.race([
    //   page.waitForNavigation({waitUntil: 'load'}),
    //   page.waitForNavigation({waitUntil: 'networkidle0'})
    // ]);
    if (selector) {
      const element = await page.$(selector);
      await element.screenshot({path: filename});
    } else {
      await page.screenshot({path: filename, fullPage: true});
    }

    await browser.close();
  })();
}

function getImage(req, res) {
  const fileName = req.query.fileName;
  const selector = req.query.selector;
  const viewport = req.query.viewport;
  const url = req.query.url;
  console.log("New request:", req.query);
  if (!url) {
    res.status(400).send('URL param missing!');
    return;
  }
  // console.log("URL: " + url);
  getFile(url, fileName, selector, viewport, res);
}

function getFile(url, targetName, selector, viewport, res) {
  let filename = uuidv4() + '.png';
  filename = filename || 'example.png';
  filename = 'tmp/' + filename;

  let targetFilename = targetName || 'snap.png';

  console.log('Filename:' + filename);
  pool
    .exec(generateSnap, [filename, url, selector, viewport])
    .then(function(result){
      return new Promise(function (resolve, reject) {
        res.download(filename, targetFilename, function (err) {
          if (err) {
            reject('Download error: ' + err);
          } else {
            resolve('All ok');
          }
        });
      });
    })
    .then(
      function() {
        console.log("Success");
      },
      function(err){
        console.log("Error: " + err);
        res.json({"error": ""+err});
        // res.status(400).send(err);
      }
    )
    .then(function(){
      fs.unlinkSync(filename);
    })
    .then(function() {
        //all ok :)
      },
      function(err){
        console.log("cleanup failed for file: " + filename);
      });
}

// Start the server
app.listen(port);
console.log('Magic happens on port ' + port);