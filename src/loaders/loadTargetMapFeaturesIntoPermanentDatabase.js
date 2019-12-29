const loadTargetMapFeaturesIntoPermanentDatabase = dbService => {
  dbService.mergeTargetMapMesoLevelPropertiesIntoTargetMapFeatures();
  dbService.loadTargetMapFeaturesIntoPermanentDatabase();
};

module.exports = loadTargetMapFeaturesIntoPermanentDatabase;
