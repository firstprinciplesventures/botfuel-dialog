/**
 * Copyright (c) 2017 - present, Botfuel (https://www.botfuel.io).
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const CompositeExtractor = require('../../src/extractors/composite-extractor');
const WsExtractor = require('../../src/extractors/ws-extractor');

describe('CompositeExtractor', () => {
  test('should properly extract', async () => {
    const extractor = new CompositeExtractor({ extractors: [new WsExtractor({ locale: 'en' })] });
    const entities = await extractor.compute('I leave from Paris');
    expect(entities).toEqual([
      {
        dim: 'city',
        body: 'Paris',
        values: [
          {
            type: 'string',
            value: 'Paris',
          },
        ],
        start: 13,
        end: 18,
      },
    ]);
  });
});