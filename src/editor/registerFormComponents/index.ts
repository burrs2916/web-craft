import { registerFormContainer } from "./formContainer";
import { registerFormButton } from "./formButton";
import { registerFormInput } from "./formInput";
import { registerFormTextarea } from "./formTextarea";
import { registerFormSelect } from "./formSelect";
import { registerFormCheckbox } from "./formCheckbox";
import { registerFormRadio } from "./formRadio";
import { registerFormLabel } from "./formLabel";
import { registerFormSwitch } from "./formSwitch";
import { registerFormSlider } from "./formSlider";
import { registerFormDate } from "./formDate";
import { registerFormTime } from "./formTime";
import { registerFormFile } from "./formFile";
import { registerFormNumber } from "./formNumber";
import { registerFormSegmented } from "./formSegmented";
import { registerFormRate } from "./formRate";
import { registerFormCascader } from "./formCascader";

/**
 * 注册表单组件（网站编辑器）
 * - 容器、按钮、输入框、文本域、下拉、复选、单选、标签、开关
 * - 滑块、日期、时间、文件、数字、分段、评分、级联
 */
export function registerFormComponents(): void {
  registerFormContainer();
  registerFormButton();
  registerFormInput();
  registerFormTextarea();
  registerFormSelect();
  registerFormCheckbox();
  registerFormRadio();
  registerFormLabel();
  registerFormSwitch();
  registerFormSlider();
  registerFormDate();
  registerFormTime();
  registerFormFile();
  registerFormNumber();
  registerFormSegmented();
  registerFormRate();
  registerFormCascader();
}

export {
  choiceValidationSchema,
  scaleFitField,
  hAlignField,
  vAlignField,
  toggleAppearanceSchemaFields,
} from "./shared";
