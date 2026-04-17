from fastapi import APIRouter
from datetime import datetime

router = APIRouter()

blocks_db = []
group12_db = []

@router.post('/blocks')
def save_block(block: dict):
    block['updated_at'] = datetime.utcnow().isoformat()
    for i, b in enumerate(blocks_db):
        if b.get('id') == block.get('id'):
            blocks_db[i] = block
            return {'status': 'updated', 'block': block}
    blocks_db.append(block)
    return {'status': 'created', 'block': block}

@router.get('/blocks')
def get_blocks():
    return {'blocks': blocks_db, 'total': len(blocks_db)}

@router.delete('/blocks/{block_id}')
def delete_block(block_id: str):
    global blocks_db
    blocks_db = [b for b in blocks_db if b.get('id') != block_id]
    return {'status': 'deleted', 'id': block_id}

@router.post('/blocks/group12')
def save_group12(data: dict):
    group12_db.clear()
    group12_db.append({**data, 'updated_at': datetime.utcnow().isoformat()})
    return {'status': 'saved'}

@router.get('/blocks/group12')
def get_group12():
    if not group12_db:
        return {'data': None}
    return {'data': group12_db[0]}
