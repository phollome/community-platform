import disciplines from "./data/disciplines.json";
import eventTypes from "./data/eventTypes.json";
import experienceLevels from "./data/experienceLevels.json";
import focuses from "./data/focuses.json";
import offers from "./data/offers.json";
import organizationTypes from "./data/organizationTypes.json";
import stages from "./data/stages.json";
import tags from "./data/tags.json";
import targetGroups from "./data/targetGroups.json";
import type { GenericEntry, TableName } from "./utils";
import { importDataset } from "./utils";

const staticDatasets: Array<{ tableName: TableName; data: GenericEntry[] }> = [
  { tableName: "offer", data: offers },
  { tableName: "organizationType", data: organizationTypes },
  { tableName: "focus", data: focuses },
  { tableName: "tag", data: tags },
  { tableName: "targetGroup", data: targetGroups },
  { tableName: "eventType", data: eventTypes },
  { tableName: "experienceLevel", data: experienceLevels },
  { tableName: "stage", data: stages },
  { tableName: "discipline", data: disciplines },
];

Promise.all(
  staticDatasets.map(
    (dataset) =>
      new Promise((resolve) => {
        importDataset(dataset.data, dataset.tableName).then(resolve);
      })
  )
)
  .catch((e) => {
    throw e;
  })
  .finally(() => {
    console.log("done.");
  });
