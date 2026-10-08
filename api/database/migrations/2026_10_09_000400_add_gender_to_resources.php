<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Who a customer will be seen by. Many customers in the region choose a
 * female specialist, or a male one, and a women's salon is staffed by women;
 * the booking page can then offer "مختصات" or "مختصون" without the customer
 * reading every name. Optional: null shows nothing.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('resources', function (Blueprint $table) {
            $table->string('gender', 6)->nullable()->after('role');
        });
    }

    public function down(): void
    {
        Schema::table('resources', fn (Blueprint $t) => $t->dropColumn('gender'));
    }
};
