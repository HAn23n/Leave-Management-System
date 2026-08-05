-- Per-leave-type flag: some types (e.g. ลากิจ) require the requester to
-- state a reason; others (e.g. ลาพักร้อน) don't. Admin-configurable per
-- type instead of a hardcoded name check, same pattern as `color`.
alter table leave_types add column require_reason boolean not null default false;

update leave_types set require_reason = true where name = 'ลากิจ';
