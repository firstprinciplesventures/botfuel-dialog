'use strict';

const nlp = require('botfuel-nlp-sdk');

class CityExtractor extends nlp.EntityExtraction {
  constructor() {
    super({
      appId: process.env.BOTFUEL_APP_ID,
      appKey: process.env.BOTFUEL_APP_KEY,
    });
  }

  compute(sentence) {
    return super.compute({
      sentence,
      dimensions: ['city', 'location'],
      timezone: 'CET',
    });
  }
}

module.exports = CityExtractor;
