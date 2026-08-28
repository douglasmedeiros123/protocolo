'use strict';

const fs = require('fs');
const path = require('path');
const { writeJson, readJson } = require('../utils/fs');
const { canonicalize } = require('../utils/canonical');

const DEFAULT_DIR = path.join(__dirname, '..', '..', 'data', 'experiments');

function listExperimentIds(dir = DEFAULT_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
}

function loadExperiment(experimentId, dir = DEFAULT_DIR) {
  return readJson(path.join(dir, `${experimentId}.json`));
}

function loadAllExperiments(dir = DEFAULT_DIR) {
  return listExperimentIds(dir).map((id) => loadExperiment(id, dir));
}

function saveExperiment(experiment, dir = DEFAULT_DIR) {
  if (!experiment.experiment_id) throw new Error('Não é possível salvar experimento sem experiment_id.');
  writeJson(path.join(dir, `${experiment.experiment_id}.json`), canonicalize(experiment));
  return experiment;
}

module.exports = { listExperimentIds, loadExperiment, loadAllExperiments, saveExperiment, DEFAULT_DIR };
