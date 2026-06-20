insert into public.lessons (id, title, description, cefr_level, topic, estimated_minutes, sort_order)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'Coffee and greetings',
    'Learn how to order politely and greet people in a cafe.',
    'A1',
    'Greetings and ordering',
    10,
    1
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Accusative basics',
    'Practice the accusative case with common objects and articles.',
    'A1',
    'Grammar: accusative articles',
    12,
    2
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'Shopping dialogue',
    'Listen to a short exchange and answer comprehension questions.',
    'A1',
    'Listening: shopping dialogue',
    10,
    3
  )
on conflict (id) do nothing;
