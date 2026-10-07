<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BusinessHour;
use App\Models\Organization;
use App\Models\Resource;
use App\Models\Service;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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

        $services = Service::with('resources:id')->where('org_id', $org)
            ->when($onlyActive, fn ($q) => $q->where('is_active', true))
            ->orderBy('sort_order')->orderBy('name')->orderBy('id')->get();
        $resources = Resource::where('org_id', $org)
            ->when($onlyActive, fn ($q) => $q->where('is_active', true))
            ->orderBy('sort_order')->orderBy('name')->orderBy('id')->get();
        $hours = BusinessHour::where('org_id', $org)->orderBy('weekday')->get();

        return response()->json([
            'business' => [
                'name' => $business?->name ?? '',
                'slug' => $business?->slug ?? '',
                'category' => $business?->category ?? '',
                'address' => $business?->address ?? '',
            ],
            'services' => $services->map(fn (Service $s) => [
                'id' => $s->id,
                'name' => $s->name,
                'category' => $s->category,
                'description' => $s->description ?? '',
                'durationMin' => $s->duration_min,
                'bufferMin' => $s->buffer_min,
                'priceMinor' => $s->price_minor,
                'resourceIds' => $s->resources->pluck('id')->all(),
                'iconKey' => $s->icon_key,
                'isActive' => $s->is_active,
            ])->all(),
            'resources' => $resources->map(fn (Resource $r) => [
                'id' => $r->id,
                'name' => $r->name,
                'role' => $r->role,
                'isActive' => $r->is_active,
            ])->all(),
            'businessHours' => $hours->map(fn (BusinessHour $h) => [
                'weekday' => $h->weekday,
                // MySQL returns "09:00:00"; the client's BusinessHours is "09:00".
                'open' => substr((string) $h->open_time, 0, 5),
                'close' => substr((string) $h->close_time, 0, 5),
                'isClosed' => $h->is_closed,
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
            'services.*.resourceIds' => ['array'],
            'services.*.iconKey' => ['required', 'string', 'max:64'],
            'services.*.isActive' => ['required', 'boolean'],
            'resources' => ['array'],
            'resources.*.id' => ['required', 'string'],
            'resources.*.name' => ['required', 'string', 'max:255'],
            'resources.*.role' => ['nullable', 'string', 'max:120'],
            'business' => ['array'],
            'business.name' => ['sometimes', 'required', 'string', 'min:2', 'max:255'],
            'business.category' => ['nullable', 'string', 'max:64'],
            'business.address' => ['nullable', 'string', 'max:255'],
            'resources.*.isActive' => ['required', 'boolean'],
            'businessHours' => ['array'],
            'businessHours.*.weekday' => ['required', 'integer', 'between:0,6'],
            'businessHours.*.open' => ['required', 'date_format:H:i'],
            'businessHours.*.close' => ['required', 'date_format:H:i'],
            'businessHours.*.isClosed' => ['required', 'boolean'],
        ]);

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
                    ['org_id' => $org, 'name' => $r['name'], 'role' => $r['role'] ?? null, 'is_active' => $r['isActive'], 'sort_order' => $i]
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
                        'icon_key' => $s['iconKey'],
                        'is_active' => $s['isActive'],
                        'sort_order' => $i,
                    ]
                );
                // The link table is a set, not a row to patch: replacing it is
                // the only way an unchecked resource actually goes away.
                $service->resources()->sync($s['resourceIds'] ?? []);
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
