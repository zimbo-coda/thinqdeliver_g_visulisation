export interface Options {
  autoDetect: boolean;
  showTextTimestamps: boolean;
  enableTextSearch: boolean;
  textWrap: boolean;
  barOrientation: 'horizontal' | 'vertical';
  pieShowPercent: boolean;
  showRawFallback: boolean;
}

export const defaultOptions: Options = {
  autoDetect: true,
  showTextTimestamps: true,
  enableTextSearch: true,
  textWrap: true,
  barOrientation: 'horizontal',
  pieShowPercent: true,
  showRawFallback: true,
};
