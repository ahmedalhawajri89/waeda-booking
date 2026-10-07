<?php

namespace App\Http\Controllers;

use App\Models\Organization;
use Illuminate\Http\Request;

abstract class Controller
{
    /**
     * The organization a request acts on.
     *
     * The caller's own org when signed in; otherwise the single public one.
     * Every controller used to inline this, and the writes then looked rows
     * up by id alone — so the org was computed and never applied. Having one
     * definition is what makes "scope every query by it" checkable.
     */
    protected function orgId(Request $request): string
    {
        return $request->user()?->org_id ?? $this->publicOrgId($request);
    }

    /**
     * The business a guest is looking at.
     *
     * A guest names it: the booking page sends `X-Org: {slug}` (or `?org=`).
     * Without a name, the first business ever created — the single-tenant
     * default the demo and older links run on. Ordered, because with UUID keys
     * "the first row" is otherwise whichever the index returns.
     *
     * Never used for operator writes: those act on the operator's own org,
     * whatever a header says, so a header cannot point a write elsewhere.
     */
    protected function publicOrgId(Request $request): string
    {
        $slug = $request->header('X-Org') ?: $request->query('org');
        if ($slug) {
            $id = Organization::where('slug', strtolower((string) $slug))->value('id');
            abort_if(! $id, 404, 'unknown_business');

            return $id;
        }

        return Organization::query()->orderBy('created_at')->orderBy('id')->value('id');
    }

    /**
     * Refuses an id that already belongs to another organization.
     *
     * The bulk writes upsert by id. Unscoped, `updateOrCreate(['id' => …])`
     * would quietly rewrite — and re-home — another tenant's row for anyone
     * who knew its id.
     *
     * @param  class-string<\Illuminate\Database\Eloquent\Model>  $model
     */
    protected function assertNotForeign(string $model, string $id, string $org): void
    {
        $owner = $model::query()->whereKey($id)->value('org_id');
        abort_if($owner !== null && $owner !== $org, 409, 'id_taken');
    }
}
