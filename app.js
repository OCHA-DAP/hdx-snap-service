// You have to use strict to try this in Node
"use strict";

const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const workerpool = require('workerpool');
const packageJson = require('./package.json');
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
  res.json({ message: `All ok! Version v${packageJson.version}` });
});

router.get('/png', getImage);

// Register routes
app.use('', router);

// Main

function generateSnap(filename, url, selector, viewport, timeout) {
  const puppeteer = require('puppeteer');

  return (async () => {
    const browser = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome',
      args: ['--headless', '--disable-gpu', '--no-sandbox', '--disable-translate', '--disable-extensions']
    });
    try {
      const page = await browser.newPage();
      if (timeout){
        page.setDefaultNavigationTimeout(timeout);
      }
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
      console.log("As always, kill Chrome :)");
      await browser.close();
    } catch (e) {
      // console.log("Error in pptr: " + e);
      console.log("As always, kill Chrome :)");
      await browser.close();
      //rethrow the error to send error message into error json
      throw e;
    }
  })();
}

function executeCommand(command){
  const execSync = require('child_process').execSync;
  console.log("cmd: " + command);
  execSync(command, (err, stdout, stderr) => {
      if (err) {
        // node couldn't execute the command
        console.error("Error, couldn't execute command: " + err);
        return;
      }

      // // the *entire* stdout and stderr (buffered)
      console.log(`stdout: ${stdout}`);
      console.log(`stderr: ${stderr}`);
  });
  return "All ok";
}

function getImage(req, res) {
  const fileName = req.query.fileName;
  const selector = req.query.selector;
  const viewport = req.query.viewport;
  const timeout = req.query.timeout;
  const resize = req.query.resize;
  const crop = req.query.crop;
  const url = req.query.url;
  console.log("New request:", req.query);
  if (!url) {
    res.status(400).send('URL param missing!');
    return;
  }
  // console.log("URL: " + url);
  getFile(url, fileName, selector, viewport, timeout, resize, crop, res);
}

function getFile(url, targetName, selector, viewport, timeout, resize, crop, res) {
  let filename = uuidv4() + '.png';
  filename = filename || 'example.png';
  filename = 'tmp/' + filename;

  let targetFilename = targetName || 'snap.png';

  console.log('Filename:' + filename);
  pool
    .exec(generateSnap, [filename, url, selector, viewport, timeout])
    .then(function(result){

      if (resize || crop){
        let command = "mogrify";
        if (resize) {
          command += " -resize " + resize;
        }
        if (crop) {
          command += " -crop " + crop;
        }
        command += " " + filename;
        return pool.exec(executeCommand, [command]);
      }

      return new Promise(function (resolve, reject){
        resolve('All ok!');
      });
    })
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