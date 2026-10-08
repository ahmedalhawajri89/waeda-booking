<?php

/*
| Waeda's plans — src/data/plans.js, value for value. Bookings are never
| limited; messages and staff are, because every message costs money.
*/

return [
    'plans' => [
        'free' => ['price_minor' => 0, 'staff' => 1, 'messages' => 50, 'features' => ['refill' => false, 'deposits' => false]],
        'basic' => ['price_minor' => 9900, 'staff' => 3, 'messages' => 300, 'features' => ['refill' => true, 'deposits' => false]],
        'pro' => ['price_minor' => 24900, 'staff' => 10, 'messages' => 1000, 'features' => ['refill' => true, 'deposits' => true]],
    ],
    'yearly_months' => 10,
    'message_pack' => ['messages' => 500, 'price_minor' => 4900],
    'trial_days' => 14,
    'trial_plan' => 'pro',
];
