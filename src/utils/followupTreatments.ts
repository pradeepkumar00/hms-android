import type { TreatmentPlanRecord } from '../components/TreatmentPlanCard';

export interface FollowupTreatmentOption {
  key: string;
  treatmentDesc: string;
  manageServiceId?: string;
  expenseAmount: number;
  date?: string;
  teeth?: Record<string, number[]>;
  description?: string;
  qty?: number;
  source: 'catalog' | 'plan';
  planTitle?: string;
}

export interface FollowupPlanGroup {
  planId: string;
  planTitle: string;
  planDate: string;
  treatments: FollowupTreatmentOption[];
}

const serviceGroupsInclude = (
  serviceGroup: unknown,
  groupName: string,
): boolean => {
  const groups = Array.isArray(serviceGroup)
    ? serviceGroup
    : String(serviceGroup || '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
  return groups.some(
    part => part.toUpperCase() === groupName.toUpperCase(),
  );
};

export const mapCatalogTreatments = (
  services: Array<Record<string, unknown>>,
  tokenType: string = 'opd',
): FollowupTreatmentOption[] => {
  const mode = String(tokenType || 'opd').trim().toLowerCase();
  const filtered = services.filter(item => {
    if (mode === 'ipd') {
      return serviceGroupsInclude(item.serviceGroup, 'IPD');
    }
    if (mode === 'opd') {
      return serviceGroupsInclude(item.serviceGroup, 'OPD');
    }
    return true;
  });

  return filtered
    .filter(item => item._id || item.id)
    .map(item => {
      const id = String(item._id ?? item.id ?? '');
      const name = String(
        item.serviceName ?? item.name ?? item.title ?? '',
      );
      return {
        key: `ms:${id}`,
        treatmentDesc: name,
        manageServiceId: id,
        expenseAmount: Number(
          item.servicePrice ??
            item.price ??
            item.serviceRate ??
            item.amount ??
            0,
        ),
        date: '',
        teeth: {},
        source: 'catalog' as const,
      };
    })
    .sort((a, b) =>
      a.treatmentDesc.localeCompare(b.treatmentDesc, undefined, {
        sensitivity: 'base',
      }),
    );
};

export const mapPlanGroups = (
  plans: TreatmentPlanRecord[] = [],
): FollowupPlanGroup[] =>
  plans
    .filter(plan => plan.status !== 'cancelled')
    .map(plan => {
      const planDateRaw = plan.createdAt || plan.updatedAt || '';
      const planDate = planDateRaw ? String(planDateRaw).slice(0, 10) : '';
      const treatments = (plan.items || [])
        .filter(item => item.treatmentDesc?.trim())
        .map((item, index) => ({
          key: `${plan._id || plan.groupId || 'plan'}:${index}`,
          treatmentDesc: String(item.treatmentDesc || '').trim(),
          date:
            String((item as { appointment?: string }).appointment || planDate),
          teeth: (item.teeth || {}) as Record<string, number[]>,
          manageServiceId: String(
            (item as { manageServiceId?: string }).manageServiceId || '',
          ),
          expenseAmount: Number(item.expenseAmount ?? item.treatmentAmount ?? 0),
          qty: item.qty,
          description: String(
            (item as { description?: string }).description || '',
          ),
          source: 'plan' as const,
          planTitle: plan.title || 'Treatment Plan',
        }));

      return {
        planId: String(plan._id || plan.groupId || ''),
        planTitle: plan.title || 'Treatment Plan',
        planDate,
        treatments,
      };
    })
    .filter(group => group.treatments.length > 0);

export interface BookFollowupDetail {
  treatmentDesc: string;
  manageServiceId: string;
  expenseAmount: number;
  date: string;
  teeth: Record<string, number[]>;
  source?: 'catalog';
  qty?: number;
  description?: string;
}

export const collectSelectedFollowupDetails = (
  selectedKeys: Set<string>,
  planGroups: FollowupPlanGroup[],
  catalogOptions: FollowupTreatmentOption[],
  followUpDate?: string | null,
): BookFollowupDetail[] => {
  const selected: FollowupTreatmentOption[] = [];

  for (const group of planGroups) {
    for (const treatment of group.treatments) {
      if (selectedKeys.has(treatment.key)) {
        selected.push(treatment);
      }
    }
  }

  for (const treatment of catalogOptions) {
    if (selectedKeys.has(treatment.key)) {
      selected.push(treatment);
    }
  }

  return selected.map(treatment => {
    const detail: BookFollowupDetail = {
      treatmentDesc: treatment.treatmentDesc,
      manageServiceId: treatment.manageServiceId || '',
      expenseAmount: Number(treatment.expenseAmount) || 0,
      date: treatment.date || followUpDate || '',
      teeth: treatment.teeth || {},
    };

    if (treatment.source === 'catalog') {
      detail.source = 'catalog';
    }
    if (treatment.qty != null) {
      detail.qty = treatment.qty;
    }
    if (treatment.description?.trim()) {
      detail.description = treatment.description.trim();
    }

    return detail;
  });
};
