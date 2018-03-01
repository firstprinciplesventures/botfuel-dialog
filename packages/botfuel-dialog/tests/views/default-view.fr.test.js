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

const DefaultView = require('../../src/views/default-view.fr');
const BotTextMessage = require('../../src/messages/bot-text-message');

describe('DefaultView FR', () => {
  test('should render a bot text message', () => {
    const view = new DefaultView();
    expect(view.render()).toEqual([new BotTextMessage("Je n'ai pas compris.")]);
  });

  test('should render a text', () => {
    const view = new DefaultView();
    expect(view.getTexts()).toEqual(["Je n'ai pas compris."]);
  });
});