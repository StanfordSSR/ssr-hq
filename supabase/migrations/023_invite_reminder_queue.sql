alter table public.notification_queue
drop constraint if exists notification_queue_notification_type_check;

alter table public.notification_queue
add constraint notification_queue_notification_type_check
check (notification_type in ('receipt', 'report', 'invite'));
