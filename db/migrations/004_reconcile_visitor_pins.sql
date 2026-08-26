UPDATE credentials
SET pin = (
  SELECT visitor_pins.pin
  FROM visitor_pins
  WHERE visitor_pins.controller_visitor_id = credentials.controller_visitor_id
    AND visitor_pins.household_id = credentials.household_id
)
WHERE household_id = 'oren-home'
  AND EXISTS (
    SELECT 1
    FROM visitor_pins
    WHERE visitor_pins.controller_visitor_id = credentials.controller_visitor_id
      AND visitor_pins.household_id = credentials.household_id
  );
