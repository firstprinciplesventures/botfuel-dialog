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

const omit = require('lodash/omit');
const logger = require('logtown')('PromptDialog');
const Dialog = require('./dialog');

// Helper functions
const areEntitiesPositionsEqual = (entityA, entityB) =>
  entityA.start === entityB.start && entityA.end === entityB.end;

const filterSamePositionEntities = (entities, entity) =>
  entities.filter(e => !areEntitiesPositionsEqual(e, entity));

/**
 * The prompt dialog prompts the user for a number of entities.
 * The dialog parameters is an Object containing:
 *   - a namespace String representing the label of the dialog
 *   - an entities Object of the form:
 * ```
 *     <entity name>: {
 *         dim: String,
 *         priority: Number or Function that returns a Number; entities parameters
 *             will be matched with potential raw entities in order or priority
 *             (highest first)
 *         isFulfilled: Function returning a boolean that determines
 *             when to stop (true) or continue (false)
 *         reducer: Function that determines what to do each time a raw entity
 *             matches with an entity parameter: replace the previously matched entity, append it...
 *     }
 * ```
 * @extends Dialog
 */
class PromptDialog extends Dialog {
  /**
   * @constructor
   * @param {Object} config - the bot config
   * @param {class} brain - the bot brain
   * @param {Object} parameters - the dialog parameters,
   * parameters.entities is a map mapping entities to optional parameters
   */
  constructor(config, brain, parameters) {
    super(config, brain, { reentrant: true }, parameters);
  }

  /**
   * Attempt to match an entity parameter with raw entities candidates extracted from a message.
   * We apply the reducer function to a raw entity candidate until we run out of candidates or
   * if the isFulfilled condition is met.
   * @param {Object} parameter - entity parameter we want to match with one or more raw entities
   * @param {Array<Object>} candidates - array of raw entities extracted
   * from a message: {
   *     dim: String,
   *     body: String,
   *     start: Number,
   *     end: Number,
   *     values: Array<Object>
   * }
   * @param {Object} initialValue - initial value of the entity we want to match
   * @returns {Object} object containing
   * remainingCandidates (candidates minus candidates used) and
   * newValue (value we matched with the parameter)
   */
  matchParameterWithCandidates({ parameter, candidates, initialValue }) {
    const sameDimCandidates = candidates.filter(candidate => candidate.dim === parameter.dim);

    // If parameter is already fulfilled and has a candidate, replace it
    if (parameter.isFulfilled(initialValue) && sameDimCandidates.length) {
      initialValue = Array.isArray(initialValue) ? [] : null;
    }

    return sameDimCandidates
      .filter(candidate => candidate.dim === parameter.dim)
      .reduce(({ newValue, remainingCandidates }, candidate) => {
        if (parameter.isFulfilled(newValue)) {
          return { remainingCandidates, newValue };
        }

        const reducedValue = parameter.reducer(newValue, candidate);

        return {
          remainingCandidates: filterSamePositionEntities(candidates, candidate),
          newValue: reducedValue === undefined ? null : reducedValue,
        };
      }, {
        remainingCandidates: candidates,
        newValue: initialValue,
      });
  }

  /**
   * @param {Array.<Object>} candidates -
   * array of raw entities given by the extractor. They are candidates for the entity parameters
   * @param {Object} dialogParameters - map of entities expected by the dialog: {
   *   <entityName>: {
   *     dim: String,
   *     priority: Number or Function,
   *     isFulfilled: Function()
   *     reducer: Function(),
   *   }
   * }
   * @param {Object} dialogEntities - a map of the entities already matched for this dialog: {
   *   <entityName>: <messageEntity>
   * }
   * @returns {Object} object containing missingEntities(subset of expectedEntities) and
   * matchedEntities (same structure as dialogEntities)
   */
  computeEntities(candidates, dialogParameters, dialogEntities = {}) {
    logger.debug('computeEntities', { candidates, dialogParameters, dialogEntities });
    // Setup default values for entities
    const parameters = Object.keys(dialogParameters)
      .reduce(
        (allEntities, name) => ({
          ...allEntities,
          [name]: {
            // If the reducer function is not defined, we replace the old entities by the new ones
            reducer: (oldEntities, newEntities) => newEntities,
            // If the fulfilled function is not defined, we consider that the fulfilled condition
            // is met if the entity simply exists (not null or undefined)
            isFulfilled: entity => entity != null,
            priority: 0,
            ...dialogParameters[name],
          },
        }),
        {},
      );

    // We need to do this in an additional step because we need isFulfilled to be defined
    // Here we set fulfilled parameters’s priority to the lowest value possible
    // Because we need to to be able to override them but we want unfulfilled parameters
    // To have priority over them
    const adjustedParameters = Object.keys(parameters)
      .reduce(
      (allEntities, name) => ({
        ...allEntities,
        [name]: {
          ...parameters[name],
          priority: parameters[name].isFulfilled(dialogEntities[name], { dialogEntities }) ?
            Number.NEGATIVE_INFINITY : parameters[name].priority,
        },
      }),
      {},
    );

    const result = Object.keys(adjustedParameters)
      // Sort expected entities by priority descending (highest priority first)
      .sort((nameA, nameB) => {
        const priorityA = adjustedParameters[nameA].priority;
        const priorityB = adjustedParameters[nameB].priority;
        const valueA = typeof priorityA === 'function' ? priorityA() : priorityA;
        const valueB = typeof priorityB === 'function' ? priorityB() : priorityB;
        return valueB - valueA;
      })
      .reduce(({ matchedEntities, remainingCandidates, missingEntities }, name) => {
        const parameter = adjustedParameters[name];
        const { newValue, remainingCandidates: newRemainingCandidates } = this
          .matchParameterWithCandidates({
            parameter,
            candidates: remainingCandidates,
            initialValue: dialogEntities[name],
          });
        logger.debug('computeEntities', { newValue, remainingCandidates });
        const isFulfilled = parameter.isFulfilled(newValue, { dialogEntities });
        return {
          // Store the found entities here as a { <entityName>: <entity> } map
          matchedEntities: { ...matchedEntities, [name]: newValue },
          remainingCandidates: newRemainingCandidates,
          // If an entity matching the one we are expecting was found,
          // remove it from missing entities
          // If it was not found, keep missing entities intact
          missingEntities: isFulfilled ? omit(missingEntities, [name]) : missingEntities,
        };
      },
      {
        matchedEntities: dialogEntities,
        remainingCandidates: candidates,
        missingEntities: adjustedParameters,
      },
    );
    return { matchedEntities: result.matchedEntities, missingEntities: result.missingEntities };
  }

  /**
   * Executes the dialog when status is 'blocked'.
   * @async
   * @param {Adapter} adapter - the adapter
   * @param {String} userId - the user id
   * @param {Object[]} [candidates] - the message entities extracted from the message
   * @returns {Promise.<String>} the new dialog status
   */
  async executeWhenBlocked(adapter, userId, candidates) {
    logger.debug('executeWhenBlocked', userId, candidates);
    await this.display(adapter, userId, 'ask');
    return { status: this.STATUS_WAITING };
  }

  /**
   * Executes the dialog when status is 'waiting'.
   * @async
   * @param {Adapter} adapter - the adapter
   * @param {String} userId - the user id
   * @param {Object[]} candidates - the message entities extracted from the message
   * @returns {Promise.<String>} the new dialog status
   */
  async executeWhenWaiting(adapter, userId, candidates) {
    logger.debug('executeWhenWaiting', userId, candidates);
    for (const candidate of candidates) {
      if (candidate.dim === 'system:boolean') {
        const booleanValue = candidate.values[0].value;
        logger.debug('execute: system:boolean', booleanValue);
        if (booleanValue) {
          // eslint-disable-next-line no-await-in-loop
          await this.display(adapter, userId, 'confirm');
          return this.executeWhenReady(adapter, userId, candidates);
        }
        // if not confirmed, then discard dialog
        // eslint-disable-next-line no-await-in-loop
        await this.display(adapter, userId, 'discard');
        return { status: this.STATUS_DISCARDED };
      }
    }
    return { status: this.STATUS_BLOCKED };
  }

  /**
   * Executes the dialog when status is 'ready'.
   * @async
   * @param {Adapter} adapter - the adapter
   * @param {String} userId - the user id
   * @param {Object[]} candidates - the message entities extracted from the message
   * @returns {Promise.<string>} the new dialog status
   */
  async executeWhenReady(adapter, userId, candidates) {
    logger.debug('executeWhenReady', userId, candidates);
    const dialogEntities =
          (await this.brain.conversationGet(userId, this.parameters.namespace)) || {};
    logger.debug('executeWhenReady: dialogEntities', dialogEntities);
    // Get missing entities and matched entities
    const { missingEntities, matchedEntities } =
          this.computeEntities(candidates, this.parameters.entities, dialogEntities);
    logger.debug('executeWhenReady', { missingEntities, matchedEntities });
    await this.brain.conversationSet(userId, this.parameters.namespace, matchedEntities);
    await this.display(adapter, userId, 'entities', { matchedEntities, missingEntities });
    if (Object.keys(missingEntities).length === 0) {
      return this.executeWhenCompleted(adapter, userId, matchedEntities);
    }
    return { status: this.STATUS_READY };
  }

  /**
   * Executes the dialog when status is 'completed'.
   * @async
   * @param {Adapter} adapter - the adapter
   * @param {String} userId - the user id
   * @param {Object[]} messageEntities - the message entities
   * @returns {Promise.<string>} the new dialog status
   */
  async executeWhenCompleted() {
    logger.debug('executeWhenCompleted');
    return { status: this.STATUS_COMPLETED };
  }

  // eslint-disable-next-line require-jsdoc
  async execute(adapter, userId, candidates, status) {
    logger.debug('execute', userId, candidates, status);
    switch (status) {
      case this.STATUS_BLOCKED:
        return this.executeWhenBlocked(adapter, userId, candidates);
      case this.STATUS_WAITING:
        return this.executeWhenWaiting(adapter, userId, candidates);
      default:
        return this.executeWhenReady(adapter, userId, candidates);
    }
  }
}

module.exports = PromptDialog;
