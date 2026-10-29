import { notFound } from 'next/navigation';
import React from 'react'

import prismadb from '@/lib/prismadb';
import { requireStoreAccess } from '@/lib/require-store';
import { SettingsForm } from './components/settings-form';

interface SettingPageprops {
    params: Promise<{
        storeId: string;
    }>
}

const SettingPage: React.FC<SettingPageprops> = async (props) => {
    const params = await props.params;
    // Same ownership guard as every other dashboard page (shared via React cache).
    const { id } = await requireStoreAccess(params.storeId);
    const store = await prismadb.store.findUnique({ where: { id } });
    if (!store) notFound();

    return (
        <div className='flex-col'>
            <div className='flex-1 space-y-4 p-8 pt-6'>
                <SettingsForm initialData={store} />
            </div>
        </div>
    );
}

export default SettingPage;
