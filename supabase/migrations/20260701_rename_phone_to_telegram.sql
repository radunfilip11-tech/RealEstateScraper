-- Switch notification delivery from WhatsApp (phone_number) to Telegram (chat ID)
ALTER TABLE notification_filters
  RENAME COLUMN phone_number TO telegram_chat_id;
