<?php

namespace Database\Seeders;

use App\Models\BusinessHour;
use App\Models\Customer;
use App\Models\Organization;
use App\Models\Resource;
use App\Models\Service;
use App\Models\User;
use App\Services\BookingWriter;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * A database that looks like a working business on the first `db:seed`.
 *
 * The defaults mirror src/data/catalog.js and src/data/seed.js, so the API
 * backend opens on the same schedule the demo backend does — an empty operator
 * console tells you nothing about whether the port worked.
 *
 * Bookings are generated relative to today rather than pinned to fixed dates,
 * for the same reason they are on the client: seed data anchored to the day it
 * was written decays into an empty screen.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // The demo business. The platform is وعدة; this is one place on it.
        $org = Organization::firstOrCreate(
            ['slug' => 'alrayhan'],
            [
                'name' => 'مركز الريحان', 'category' => 'عيادة جلدية وتجميل',
                'address' => 'حي الياسمين، الرياض', 'timezone' => 'Asia/Riyadh', 'currency' => 'SAR',
            ]
        );

        // The one account that can reach the console. Seeded rather than
        // registered because `role` is not fillable — which is the point.
        $operator = User::firstOrNew(['email' => 'operator@example.com']);
        $operator->fill(['name' => 'مدير النظام', 'password' => 'password']);
        $operator->org_id = $org->id;
        $operator->role = 'operator';
        $operator->save();

        $rooms = collect([
            ['id' => (string) Str::uuid(), 'name' => 'د. سارة العتيبي', 'gender' => 'female'],
            ['id' => (string) Str::uuid(), 'name' => 'د. خالد المطيري', 'gender' => 'male'],
        ])->map(fn ($r, $i) => Resource::firstOrCreate(
            ['org_id' => $org->id, 'name' => $r['name']],
            ['id' => $r['id'], 'gender' => $r['gender'], 'is_active' => true, 'sort_order' => $i]
        ));

        $services = collect([
            [
                'name' => 'استشارة جلدية',
                'description' => 'فحص البشرة ومناقشة حالتك ووضع خطة علاج مناسبة.',
                'duration_min' => 30, 'buffer_min' => 10, 'price_minor' => 15000,
                'icon_key' => 'Stethoscope', 'rooms' => [0, 1],
            ],
            [
                'name' => 'تنظيف بشرة عميق',
                'description' => 'تنظيف وتقشير وترطيب، مناسب لكل أنواع البشرة.',
                'duration_min' => 45, 'buffer_min' => 15, 'price_minor' => 22000,
                'icon_key' => 'Sparkles', 'rooms' => [0],
            ],
            [
                'name' => 'جلسة ليزر',
                'description' => 'جلسة إزالة شعر بالليزر لمنطقة كاملة، بأجهزة معتمدة.',
                'duration_min' => 120, 'buffer_min' => 30, 'price_minor' => 45000,
                'icon_key' => 'HeartPulse', 'rooms' => [1],
            ],
        ])->map(function ($s, $i) use ($org, $rooms) {
            $service = Service::firstOrCreate(
                ['org_id' => $org->id, 'name' => $s['name']],
                [
                    'id' => (string) Str::uuid(),
                    'description' => $s['description'],
                    'duration_min' => $s['duration_min'],
                    'buffer_min' => $s['buffer_min'],
                    'price_minor' => $s['price_minor'],
                    'icon_key' => $s['icon_key'],
                    'is_active' => true,
                    'sort_order' => $i,
                ]
            );
            $service->resources()->sync(collect($s['rooms'])->map(fn ($r) => $rooms[$r]->id)->all());

            return $service;
        });

        // 0 = Sunday … 6 = Saturday. Hours vary by day, as they do in practice.
        foreach ([
            [0, '09:00', '18:00'], [1, '09:00', '18:00'], [2, '09:00', '18:00'],
            [3, '09:00', '18:00'], [4, '09:00', '16:00'], [5, '14:00', '20:00'],
            [6, '10:00', '18:00'],
        ] as [$weekday, $open, $close]) {
            BusinessHour::updateOrCreate(
                ['org_id' => $org->id, 'weekday' => $weekday],
                ['open_time' => $open, 'close_time' => $close, 'is_closed' => false]
            );
        }

        $customers = collect([
            ['أحمد سعيد', '0501234501'],
            ['سارة خالد', '0501234502'],
            ['محمد علي', '0501234503'],
            ['فاطمة أحمد', '0501234504'],
            ['خالد الحربي', '0501234505'],
            ['نورة القحطاني', '0501234506'],
        ])->map(fn ($c) => Customer::firstOrCreate(
            ['org_id' => $org->id, 'phone' => $c[1]],
            ['id' => (string) Str::uuid(), 'name' => $c[0]]
        ));

        if (\App\Models\Booking::query()->exists()) {
            $this->command->info('Bookings already seeded — leaving them alone.');

            return;
        }

        // Deliberately includes the awkward cases the operator console exists
        // to surface: an unpaid booking whose time is close, one that ran past
        // its end without being closed out, and a no-show.
        $writer = app(BookingWriter::class);
        $today = Carbon::today();

        $specs = [
            [0, '09:00', 0, 0, 0, 'completed', 'paid'],
            [0, '10:00', 1, 1, 0, 'completed', 'paid'],
            [0, '12:00', 2, 0, 0, 'confirmed', 'unpaid'],
            [0, '13:00', 3, 0, 1, 'confirmed', 'unpaid'],
            [0, '14:00', 4, 1, 0, 'confirmed', 'deposit_paid'],
            [0, '15:30', 5, 0, 0, 'pending',   'unpaid'],
            [0, '16:30', 0, 2, 1, 'confirmed', 'paid'],
            [1, '11:00', 1, 0, 0, 'pending',   'unpaid'],
            [1, '13:00', 2, 1, 0, 'confirmed', 'paid'],
            [-1, '10:00', 3, 0, 0, 'no_show',  'unpaid'],
            [-2, '11:00', 4, 1, 0, 'completed', 'paid'],
        ];

        foreach ($specs as [$dayOffset, $hm, $customer, $service, $room, $status, $payment]) {
            [$h, $m] = explode(':', $hm);
            $start = $today->copy()->addDays($dayOffset)->setTime((int) $h, (int) $m);

            $writer->create([
                'org_id' => $org->id,
                'customer_id' => $customers[$customer]->id,
                'service_id' => $services[$service]->id,
                'resource_id' => $rooms[$room]->id,
                'start_at' => $start,
                'status' => $status,
                'payment_status' => $payment,
                'channel' => ['online', 'phone', 'walk_in'][$customer % 3],
            ], $operator->id);
        }

        $this->command->info('Seeded '.count($specs).' bookings across '.$customers->count().' customers.');
    }
}
