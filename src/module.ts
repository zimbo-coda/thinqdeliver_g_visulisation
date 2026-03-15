import { PanelPlugin } from '@grafana/data';
import { QuestionVizPanel } from './panel';
import { defaultOptions, Options } from './types';

export const plugin = new PanelPlugin<Options>(QuestionVizPanel)
  .setPanelOptions(builder => {
    return builder
      .addBooleanSwitch({ path: 'autoDetect', name: 'Auto-detect renderer from question_type', defaultValue: defaultOptions.autoDetect })
      .addRadio({
        path: 'barOrientation',
        name: 'Bar orientation',
        defaultValue: defaultOptions.barOrientation,
        settings: {
          options: [
            { value: 'horizontal', label: 'Horizontal' },
            { value: 'vertical', label: 'Vertical' },
          ],
        },
      })
      .addBooleanSwitch({ path: 'pieShowPercent', name: 'Show percent on pie', defaultValue: defaultOptions.pieShowPercent })
      .addBooleanSwitch({ path: 'showTextTimestamps', name: 'Show timestamps for text responses', defaultValue: defaultOptions.showTextTimestamps })
      .addBooleanSwitch({ path: 'enableTextSearch', name: 'Enable search for text responses', defaultValue: defaultOptions.enableTextSearch })
      .addBooleanSwitch({ path: 'textWrap', name: 'Wrap text responses', defaultValue: defaultOptions.textWrap })
      .addBooleanSwitch({ path: 'showRawFallback', name: 'Show raw table on fallback/empty', defaultValue: defaultOptions.showRawFallback });
  })
  .setDefaults(defaultOptions);
