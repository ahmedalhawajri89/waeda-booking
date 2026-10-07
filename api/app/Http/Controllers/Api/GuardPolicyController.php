<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The appointment guard's policy for the operator's organization.
 *
 * Validated field by field rather than stored as whatever arrived: these
 * numbers will drive when customers are messaged and when their slot is
 * released, so a malformed one must never reach the table.
 */
class GuardPolicyController extends Controller
{
    public function show(Request $request)
    {
        $row = DB::table('guard_policies')->where('org_id', $this->orgId($request))->value('policy');

        return response()->json(['policy' => $row ? json_decode($row, true) : null]);
    }

    public function update(Request $request)
    {
        $policy = $request->validate([
            'mediumAt' => ['required', 'numeric', 'between:0.01,0.9'],
            'highAt' => ['required', 'numeric', 'between:0.02,0.95', 'gt:mediumAt'],
            'remindHoursBefore' => ['required', 'integer', 'between:1,168'],
            'confirmHoursBefore' => ['required', 'integer', 'between:1,72'],
            'depositForHigh' => ['required', 'boolean'],
            'autoRelease' => ['required', 'boolean'],
            'releaseHoursBefore' => ['required', 'integer', 'between:1,48', 'lt:confirmHoursBefore'],
        ]);

        DB::table('guard_policies')->updateOrInsert(
            ['org_id' => $this->orgId($request)],
            ['policy' => json_encode($policy), 'updated_at' => now(), 'created_at' => now()],
        );

        return response()->noContent();
    }
}
