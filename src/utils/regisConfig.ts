import { RegisField, RegisFieldOption } from '../types';

const DOCTOR_FIELD_KEYS = /^(doctorId|doctor|selectDoctor|doctor_id)$/i;
const CO_DOCTOR_FIELD_KEYS = /^(coDoctorId|coDoctor|selectCoDoctor|co_doctor)$/i;

/** Matches the web HMS registration form schema. */
const BASE_FORM_SCHEMA: Omit<RegisField, 'visible'>[] = [
  {
    key: 'title',
    label: 'Title',
    type: 'select',
    required: false,
    placeholder: 'Select title',
    options: [
      { label: 'Mr', value: 'Mr' },
      { label: 'Mrs', value: 'Mrs' },
      { label: 'Baby', value: 'Baby' },
      { label: 'Baba', value: 'Baba' },
      { label: 'Miss', value: 'Miss' },
    ],
  },
  {
    key: 'name',
    label: 'Patient Name',
    type: 'text',
    required: true,
    placeholder: 'Enter your full name',
  },
  {
    key: 'mobileNo',
    label: 'Mobile Number',
    type: 'text',
    required: true,
    placeholder: 'Enter your Mobile Number',
  },
  {
    key: 'email',
    label: 'Email Address',
    type: 'email',
    required: false,
    placeholder: 'Enter your email',
  },
  {
    key: 'gender',
    label: 'Gender',
    type: 'select',
    required: false,
    placeholder: 'Select Gender',
    options: [
      { label: 'Male', value: 'Male' },
      { label: 'Female', value: 'Female' },
      { label: 'Other', value: 'Other' },
    ],
  },
  {
    key: 'age',
    label: 'Age',
    type: 'number',
    required: false,
    placeholder: 'Enter Age',
  },
  {
    key: 'careType',
    label: 'Care Type',
    type: 'select',
    required: false,
    placeholder: 'Select Care Type',
    options: [
      { label: 'S/o', value: 'S/o' },
      { label: 'W/o', value: 'W/o' },
      { label: 'D/o', value: 'D/o' },
      { label: 'Other', value: 'Other' },
    ],
  },
  {
    key: 'careTaker',
    label: 'Care Of',
    type: 'text',
    required: false,
    placeholder: 'Name of caretaker',
  },
  {
    key: 'doctorId',
    label: 'Select Doctor',
    type: 'doctor',
    required: true,
    placeholder: 'Select Doctor',
  },
  {
    key: 'date',
    label: 'Appointment Date',
    type: 'date',
    required: true,
    placeholder: 'Select Date',
  },
  {
    key: 'coDoctorId',
    label: 'Select Co-Doctor',
    type: 'doctor',
    required: false,
    placeholder: 'Select Co-Doctor',
  },
  {
    key: 'address',
    label: 'Address',
    type: 'textarea',
    required: false,
    placeholder: 'Enter address',
  },
  {
    key: 'visitType',
    label: 'Appointment Type',
    type: 'select',
    required: false,
    placeholder: 'Select appointment type',
    defaultValue: 'Normal',
    options: [
      { label: 'Normal', value: 'Normal' },
      { label: 'Follow Up', value: 'Follow Up' },
    ],
  },
];

const normalizeOptions = (raw: any): RegisFieldOption[] => {
  if (!raw) return [];

  const list = Array.isArray(raw)
    ? raw
    : Object.entries(raw).map(([value, label]) => ({
        value,
        label: String(label),
      }));

  return list
    .map((item: any) => {
      if (typeof item === 'string') {
        return { label: item, value: item };
      }
      const value = item?.value ?? item?.id ?? item?.key ?? item?.code ?? item?.name;
      const label =
        item?.label ?? item?.title ?? item?.name ?? item?.text ?? String(value ?? '');
      if (value == null || value === '') return null;
      return { label: String(label), value: String(value) };
    })
    .filter(Boolean) as RegisFieldOption[];
};

const isFieldVisible = (fieldKey: string, regisConfig: Record<string, any>): boolean => {
  if (fieldKey === 'coDoctorId') {
    return Boolean(regisConfig?.coDoctor?.isAdmin);
  }

  const configEntry = regisConfig?.[fieldKey];
  if (configEntry && typeof configEntry === 'object') {
    if (configEntry.isAdmin === false) return false;
    if (configEntry.isAdmin === true) return true;
    if (configEntry.visible === false || configEntry.isHidden === true) return false;
    if (configEntry.visible === true) return true;
  }

  // Default to visible when config has no explicit flag for this field.
  return true;
};

const mapCustomField = (raw: any): RegisField | null => {
  const key = raw?.labelName ?? raw?.name ?? raw?.key;
  if (!key) return null;

  const labelType = String(raw?.labelType ?? raw?.type ?? 'text');
  const type = labelType.includes('Dropdown')
    ? 'select'
    : labelType.includes('Date')
    ? 'date'
    : 'text';

  return {
    key,
    label: raw?.label ?? raw?.labelName ?? key,
    type,
    required: false,
    placeholder: raw?.placeholder,
    options: type === 'select' ? normalizeOptions(raw?.dropdown ?? raw?.options) : undefined,
    visible: raw?.assign?.isAdmin !== false,
  };
};

export const isDoctorField = (key: string) => DOCTOR_FIELD_KEYS.test(key);
export const isCoDoctorField = (key: string) => CO_DOCTOR_FIELD_KEYS.test(key);

/** Only core registration fields are required when enabled; everything else is optional. */
export const isRegistrationRequiredField = (field: RegisField): boolean => {
  if (field.key === 'name' || field.key === 'mobileNo') return true;
  if (field.type === 'date' || field.key === 'date') return true;
  if (
    (field.type === 'doctor' || isDoctorField(field.key)) &&
    !isCoDoctorField(field.key)
  ) {
    return true;
  }
  return false;
};

/**
 * Build the registration form from tenant config.
 * The web app uses a fixed FORM_SCHEMA and toggles fields via regisConfig[field].isAdmin.
 */
export const extractRegisFields = (config: any): RegisField[] => {
  const root = config?.data ?? config ?? {};
  const regisConfig = root.regisConfig ?? config?.regisConfig ?? {};

  const fields: RegisField[] = BASE_FORM_SCHEMA.map(field => ({
    ...field,
    required: isRegistrationRequiredField(field),
    visible: isFieldVisible(field.key, regisConfig),
  })).filter(field => field.visible !== false);

  const customFields = Array.isArray(regisConfig?.fields) ? regisConfig.fields : [];
  customFields.forEach((customField: any) => {
    const mapped = mapCustomField(customField);
    if (mapped && mapped.visible !== false) {
      fields.push(mapped);
    }
  });

  return fields;
};

export const buildInitialFormValues = (fields: RegisField[]): Record<string, string> => {
  const values: Record<string, string> = {};
  const today = new Date();

  fields.forEach(field => {
    if (field.type === 'date') {
      values[field.key] = today.toISOString().slice(0, 10);
      return;
    }
    if (field.defaultValue != null && field.defaultValue !== '') {
      values[field.key] = String(field.defaultValue);
      return;
    }
    values[field.key] = '';
  });

  return values;
};

export const formatDateForDisplay = (value?: string) => {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (isNaN(date.getTime())) return value;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
};
