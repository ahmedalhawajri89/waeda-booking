<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BusinessHour;
use App\Models\Organization;
use App\Models\Resource;
use App\Models\Service;
use App\Services\Subscription;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Services, resources and opening hours — everything Settings can edit.
 *
 * The responses are the domain shape the client already speaks, not table
 * rows: camelCase, minor units, "09:00" rather than "09:00:00". That is the
 * job the Supabase mappers used to do on the client, moved to the side of the
 * wire that owns the schema. The seam still holds — snake_case stops here.
 */
class CatalogController extends Controller
{
    public function show(Request $request)
    {
        // A guest page names its business; the console reads its own.
        $org = $request->hasHeader('X-Org') || $request->query('org')
            ? $this->publicOrgId($request)
            : $this->orgId($request);
        $business = Organization::query()->whereKey($org)->first();

        // `services_public_read` exposed only active rows to anon: a service
        // the operator switched off should not be discoverable. Settings needs
        // the inactive ones to switch them back on, so an operator sees all.
        $onlyActive = ! ($request->user()?->isOperator() && $request->user()->org_id === $org);

        $services = Service::with(['resources:id', 'sessions'])->where('org_id', $org)
            ->when($onlyActive, fn ($q) => $q->where('is_active', true))
            ->orderBy('sort_order')->orderBy('name')->orderBy('id')->get();
        $resources = Resource::where('org_id', $org)
            ->when($onlyActive, fn ($q) => $q->where('is_active', true))
            ->orderBy('sort_order')->orderBy('name')->orderBy('id')->get();
        $hours = BusinessHour::where('org_id', $org)->orderBy('weekday')->get();
        $periods = DB::table('special_periods')->where('org_id', $org)->orderBy('starts_on')->get();

        return response()->json([
            'business' => [
                'name' => $business?->name ?? '',
                'slug' => $business?->slug ?? '',
                'category' => $business?->category ?? '',
                'address' => $business?->address ?? '',
                // The clock its hours are kept in: the booking page shows and
                // computes times in it, wherever the guest happens to be.
                'timezone' => $business?->timezone ?? 'UTC',
            ],
            'services' => $services->map(fn (Service $s) => [
                'id' => $s->id,
                'name' => $s->name,
                'category' => $s->category,
                'description' => $s->description ?? '',
                'durationMin' => $s->duration_min,
                'durationOptions' => $s->duration_options,
                'bufferMin' => $s->buffer_min,
                'priceMinor' => $s->price_minor,
                'peakFrom' => $s->peak_from ? substr((string) $s->peak_from, 0, 5) : null,
                'peakPriceMinor' => $s->peak_price_minor,
                'capacity' => $s->capacity ?? 1,
                'sessions' => $s->sessions->map(fn ($x) => [
                    'id' => $x->id,
                    'weekday' => $x->weekday,
                    'time' => substr((string) $x->start_time, 0, 5),
                    'resourceId' => $x->resource_id,
                ])->all(),
                'resourceIds' => $s->resources->pluck('id')->all(),
                'iconKey' => $s->icon_key,
                'isActive' => $s->is_active,
            ])->all(),
            'resources' => $resources->map(fn (Resource $r) => [
                'id' => $r->id,
                'name' => $r->name,
                'role' => $r->role,
                'gender' => $r->gender,
                'kind' => $r->kind ?? 'person',
                'isActive' => $r->is_active,
            ])->all(),
            'businessHours' => $hours->map(fn (BusinessHour $h) => [
                'weekday' => $h->weekday,
                // MySQL returns "09:00:00"; the client's BusinessHours is "09:00".
                'open' => substr((string) $h->open_time, 0, 5),
                'close' => substr((string) $h->close_time, 0, 5),
                'isClosed' => $h->is_closed,
            ])->all(),
            // Off when never set; the client fills in its defaults.
            'prayer' => $business?->prayer_breaks ? json_decode($business->prayer_breaks, true) : null,
            'specialPeriods' => $periods->map(fn ($p) => [
                'id' => $p->id,
                'label' => $p->label,
                'startsOn' => substr((string) $p->starts_on, 0, 10),
                'endsOn' => substr((string) $p->ends_on, 0, 10),
                'hours' => json_decode($p->hours, true),
            ])->all(),
        ]);
    }

    public function update(Request $request)
    {
        $data = $request->validate([
            'services' => ['array'],
            'services.*.id' => ['required', 'string'],
            'services.*.name' => ['required', 'string', 'max:255'],
            'services.*.category' => ['nullable', 'string', 'max:64'],
            'services.*.description' => ['nullable', 'string'],
            'services.*.durationMin' => ['required', 'integer', 'min:1'],
            'services.*.bufferMin' => ['required', 'integer', 'min:0'],
            'services.*.priceMinor' => ['required', 'integer', 'min:0'],
            'services.*.durationOptions' => ['nullable', 'array', 'max:6'],
            'services.*.durationOptions.*' => ['integer', 'between:5,600', 'distinct'],
            'services.*.peakFrom' => ['nullable', 'date_format:H:i'],
            'services.*.peakPriceMinor' => ['nullable', 'integer', 'min:0'],
            'services.*.capacity' => ['nullable', 'integer', 'between:1,500'],
            'services.*.sessions' => ['nullable', 'array', 'max:60'],
            'services.*.sessions.*.weekday' => ['required', 'integer', 'between:0,6'],
            'services.*.sessions.*.time' => ['required', 'date_format:H:i'],
            'services.*.sessions.*.resourceId' => ['required', 'string'],
            'services.*.resourceIds' => ['array'],
            'services.*.iconKey' => ['required', 'string', 'max:64'],
            'services.*.isActive' => ['required', 'boolean'],
            'resources' => ['array'],
            'resources.*.id' => ['required', 'string'],
            'resources.*.name' => ['required', 'string', 'max:255'],
            'resources.*.role' => ['nullable', 'string', 'max:120'],
            'resources.*.gender' => ['nullable', 'in:female,male'],
            'resources.*.kind' => ['nullable', 'in:person,place'],
            'business' => ['array'],
            'business.name' => ['sometimes', 'required', 'string', 'min:2', 'max:255'],
            'business.category' => ['nullable', 'string', 'max:64'],
            'business.address' => ['nullable', 'string', 'max:255'],
            'resources.*.isActive' => ['required', 'boolean'],
            'businessHours' => ['array'],
            'businessHours.*.weekday' => ['required', 'integer', 'between:0,6'],
            'businessHours.*.open' => ['required', 'date_format:H:i'],
            // A close before the open is a late night; only the same time twice is no day.
            'businessHours.*.close' => ['required', 'date_format:H:i', 'different:businessHours.*.open'],
            'businessHours.*.isClosed' => ['required', 'boolean'],
            'specialPeriods' => ['array', 'max:50'],
            'specialPeriods.*.id' => ['required', 'uuid'],
            'specialPeriods.*.label' => ['required', 'string', 'min:2', 'max:80'],
            'specialPeriods.*.startsOn' => ['required', 'date_format:Y-m-d'],
            'specialPeriods.*.endsOn' => ['required', 'date_format:Y-m-d', 'after_or_equal:specialPeriods.*.startsOn'],
            'specialPeriods.*.hours' => ['required', 'array', 'size:7'],
            'specialPeriods.*.hours.*.weekday' => ['required', 'integer', 'between:0,6'],
            'specialPeriods.*.hours.*.open' => ['required', 'date_format:H:i'],
            'specialPeriods.*.hours.*.close' => ['required', 'date_format:H:i'],
            'specialPeriods.*.hours.*.isClosed' => ['required', 'boolean'],
            'prayer' => ['nullable', 'array'],
            'prayer.enabled' => ['required_with:prayer', 'boolean'],
            'prayer.city' => ['required_with:prayer', 'string', 'in:'.implode(',', array_keys(config('cities')))],
            'prayer.prayers' => ['array'],
            'prayer.prayers.*' => ['in:fajr,dhuhr,asr,maghrib,isha', 'distinct'],
            'prayer.minutes' => ['required_with:prayer', 'integer', 'between:5,90'],
            'prayer.jumuahMinutes' => ['required_with:prayer', 'integer', 'between:5,120'],
        ]);

        // Seats are what plans are priced on: count who would be active after
        // this save. Switched-off staff keep their history and cost nothing.
        if (array_key_exists('resources', $data)) {
            $sent = collect($data['resources']);
            $active = $sent->where('isActive', true)->count()
                + Resource::where('org_id', $this->orgId($request))->where('is_active', true)
                    ->whereNotIn('id', $sent->pluck('id'))->count();
            $limit = app(Subscription::class)->staffLimit($this->orgId($request));
            if ($active > $limit) {
                return response()->json([
                    'error' => 'staff_limit',
                    'message' => "باقتك تسمح بـ{$limit} من الفريق. رقِّ اشتراكك لإضافة المزيد.",
                    'limit' => $limit,
                ], 422);
            }
        }

        // Two periods on the same date would leave "which hours?" to chance.
        $periods = collect($data['specialPeriods'] ?? [])->sortBy('startsOn')->values();
        foreach ($periods as $i => $p) {
            if ($i > 0 && $p['startsOn'] <= $periods[$i - 1]['endsOn']) {
                throw ValidationException::withMessages([
                    'specialPeriods' => ['الفترات الخاصة لا تتداخل: «'.$periods[$i - 1]['label'].'» و«'.$p['label'].'».'],
                ]);
            }
        }

        $org = $this->orgId($request);

        // One transaction for the whole snapshot. A half-applied catalog — new
        // services pointing at resources that were not written — is worse than
        // a rejected save, because nothing tells anyone it happened.
        DB::transaction(function () use ($data, $org) {
            // The profile, never the slug: links already shared must keep working.
            if (! empty($data['business'])) {
                Organization::query()->whereKey($org)->update(array_filter([
                    'name' => $data['business']['name'] ?? null,
                    'category' => $data['business']['category'] ?? null,
                    'address' => $data['business']['address'] ?? null,
                ], fn ($v) => $v !== null));
            }

            foreach ($data['resources'] ?? [] as $i => $r) {
                $this->assertNotForeign(Resource::class, $r['id'], $org);
                Resource::updateOrCreate(
                    ['id' => $r['id']],
                    ['org_id' => $org, 'name' => $r['name'], 'role' => $r['role'] ?? null, 'gender' => $r['gender'] ?? null, 'kind' => $r['kind'] ?? 'person', 'is_active' => $r['isActive'], 'sort_order' => $i]
                );
            }

            foreach ($data['services'] ?? [] as $i => $s) {
                $this->assertNotForeign(Service::class, $s['id'], $org);
                // Only this organization's resources can be linked to its services.
                $s['resourceIds'] = Resource::where('org_id', $org)
                    ->whereIn('id', $s['resourceIds'] ?? [])->pluck('id')->all();
                $service = Service::updateOrCreate(
                    ['id' => $s['id']],
                    [
                        'org_id' => $org,
                        'name' => $s['name'],
                        'category' => $s['category'] ?? null,
                        'description' => $s['description'] ?? '',
                        'duration_min' => $s['durationMin'],
                        'buffer_min' => $s['bufferMin'],
                        'price_minor' => $s['priceMinor'],
                        // The default length is always one of the offered ones.
                        'duration_options' => empty($s['durationOptions']) ? null
                            : array_values(array_unique([...array_map('intval', $s['durationOptions']), (int) $s['durationMin']])),
                        'peak_from' => ($s['peakFrom'] ?? null) && isset($s['peakPriceMinor']) ? $s['peakFrom'] : null,
                        'peak_price_minor' => ($s['peakFrom'] ?? null) && isset($s['peakPriceMinor']) ? $s['peakPriceMinor'] : null,
                        'icon_key' => $s['iconKey'],
                        'is_active' => $s['isActive'],
                        'sort_order' => $i,
                    ]
                );
                // The link table is a set, not a row to patch: replacing it is
                // the only way an unchecked resource actually goes away.
                $service->resources()->sync($s['resourceIds'] ?? []);
                $service->forceFill(['capacity' => max(1, (int) ($s['capacity'] ?? 1))])->save();

                // A class's weekly times: the list is the whole set, on this
                // business's own staff and places only.
                if (array_key_exists('sessions', $s)) {
                    $mine = Resource::where('org_id', $org)->pluck('id')->flip();
                    $service->sessions()->delete();
                    foreach ($s['sessions'] ?? [] as $x) {
                        if (! $mine->has($x['resourceId'])) {
                            continue;
                        }
                        $service->sessions()->create([
                            'id' => (string) Str::uuid(), 'org_id' => $org,
                            'resource_id' => $x['resourceId'], 'weekday' => $x['weekday'], 'start_time' => $x['time'],
                        ]);
                    }
                }
            }

            if (array_key_exists('prayer', $data)) {
                DB::table('organizations')->where('id', $org)->update([
                    'prayer_breaks' => $data['prayer'] === null ? null : json_encode([
                        'enabled' => (bool) $data['prayer']['enabled'],
                        'city' => $data['prayer']['city'],
                        'prayers' => array_values($data['prayer']['prayers'] ?? []),
                        'minutes' => (int) $data['prayer']['minutes'],
                        'jumuahMinutes' => (int) $data['prayer']['jumuahMinutes'],
                    ]),
                ]);
            }

            // The list is the whole set: a period left out is a period removed.
            if (array_key_exists('specialPeriods', $data)) {
                $ids = collect($data['specialPeriods'])->pluck('id')->all();
                if (DB::table('special_periods')->whereIn('id', $ids)->where('org_id', '!=', $org)->exists()) {
                    abort(403);
                }
                DB::table('special_periods')->where('org_id', $org)->whereNotIn('id', $ids)->delete();
                foreach ($data['specialPeriods'] as $p) {
                    DB::table('special_periods')->updateOrInsert(
                        ['id' => $p['id']],
                        [
                            'org_id' => $org,
                            'label' => $p['label'],
                            'starts_on' => $p['startsOn'],
                            'ends_on' => $p['endsOn'],
                            'hours' => json_encode(array_values($p['hours'])),
                            'updated_at' => now(),
                            'created_at' => now(),
                        ]
                    );
                }
            }

            foreach ($data['businessHours'] ?? [] as $h) {
                // The query builder, not Eloquent. business_hours is keyed on
                // (org_id, weekday) with no surrogate id, and Eloquent builds
                // its UPDATE from a single primary key — which is null here,
                // so updateOrCreate() reported success and changed nothing.
                DB::table('business_hours')->updateOrInsert(
                    ['org_id' => $org, 'weekday' => $h['weekday']],
                    ['open_time' => $h['open'], 'close_time' => $h['close'], 'is_closed' => $h['isClosed']]
                );
            }
        });

        return response()->noContent();
    }
}
