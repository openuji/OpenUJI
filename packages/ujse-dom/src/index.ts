import { ScrollEngine } from "@openuji/ujse-core";

export const ScrollEngineDOM = {
  init: () => {
    ScrollEngine.init();
    console.log("Scroll Engine DOM Initialized");
  },
};
