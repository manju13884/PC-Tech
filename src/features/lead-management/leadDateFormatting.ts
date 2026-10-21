import { formatIstDate, formatIstDateTime } from '../../utils/dateTimeFormatting'

export const formatLeadDate = (value: string | null | undefined, fallback = '\u2014') =>
  formatIstDate(value, fallback).replace(/^(\d{2})-(\w{3})-(\d{4})/, '$1 $2 $3')

export const formatLeadDateTime = (value: string | null | undefined) =>
  formatIstDateTime(value).replace(/^(\d{2})-(\w{3})-(\d{4})/, '$1 $2 $3')
