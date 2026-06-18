export interface ManageServiceSummary {
  _id: string;
  name: string;
  price: number;
}

export const parseManageServiceList = (
  data: unknown,
): Array<Record<string, unknown>> => {
  const list =
    (data as { data?: unknown })?.data ??
    (data as { services?: unknown })?.services ??
    (data as { result?: unknown })?.result ??
    data ??
    [];
  return Array.isArray(list) ? (list as Array<Record<string, unknown>>) : [];
};

export const getManageServiceType = (item: Record<string, unknown>): string =>
  String(item.serviceType ?? item.type ?? '').trim();

export const filterManageServicesByType = (
  services: Array<Record<string, unknown>>,
  type: string,
): Array<Record<string, unknown>> => {
  const normalizedType = type.trim().toLowerCase();
  if (!normalizedType) return services;
  return services.filter(
    item => getManageServiceType(item).toLowerCase() === normalizedType,
  );
};

export const toManageServiceSummary = (
  item: Record<string, unknown>,
): ManageServiceSummary => ({
  _id: String(item._id ?? item.id ?? ''),
  name: String(item.serviceName ?? item.name ?? item.title ?? ''),
  price: Number(
    item.servicePrice ??
      item.price ??
      item.amount ??
      item.cost ??
      item.fees ??
      item.rate ??
      0,
  ),
});

export const toManageServiceSummaries = (
  services: Array<Record<string, unknown>>,
): ManageServiceSummary[] =>
  services
    .filter(item => item._id || item.id)
    .map(toManageServiceSummary);
